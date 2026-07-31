/**
 * Blossom uploads (BUD-11).
 *
 * # The hash comes first
 *
 * The relay requires the upload to be authorized for *that exact file*: the
 * request carries `X-SHA-256`, and the kind:24242 auth event must carry a
 * matching `x` tag (`crates/nuxx-relay/src/api/media.rs`). The signature
 * therefore cannot be produced until the file has been read and hashed, which
 * fixes the order — hash, then sign, then send — and rules out streaming the
 * body past a signer that has not yet seen it.
 *
 * That ordering is the reason this module exists as its own step rather than
 * living in the composer: the whole file must be resident before the request can
 * even be authorized, so the size ceiling has to be enforced here, up front,
 * where refusing is still cheap.
 *
 * # What the message carries
 *
 * An upload does not put a URL in the message body and hope the reader guesses
 * the rest. It attaches a NIP-92 `imeta` tag, so the renderer knows the MIME
 * type, the size, and — for images — the intrinsic dimensions the relay measured
 * server-side, which is what lets the renderer reserve layout space before the
 * image decodes instead of making the timeline jump when a tall image arrives.
 */

import type { EventTemplate } from "@/shared/lib/signer";
import { relayHttpBaseUrl } from "@/shared/lib/relay-url";

/** Blossom auth event kind (BUD-01). */
const KIND_BLOSSOM_AUTH = 24242;

/**
 * How long an upload authorization stays valid.
 *
 * The relay also bounds `created_at` independently, so this only has to cover
 * the request itself — long enough for a slow connection to finish sending, not
 * long enough to be worth capturing.
 */
const AUTH_LIFETIME_SECONDS = 10 * 60;

/**
 * Largest file this client will attempt.
 *
 * The relay enforces its own limits, but it can only do so after the bytes are
 * on the wire. Refusing here saves the reader from watching a long upload fail,
 * and — because hashing requires the whole file in memory — from a tab that
 * stalls before the request is even made.
 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** What the relay returns for an accepted upload. */
export interface BlobDescriptor {
  url: string;
  sha256: string;
  size: number;
  type: string;
  uploaded: number;
  dim?: string;
  blurhash?: string;
}

export class UploadError extends Error {}

/** SHA-256 of the file, lowercase hex — the form both the header and tag use. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  // `crypto.subtle` is only defined in a secure context. Nuxx is served over
  // https (or localhost in development), so this is available wherever the app
  // runs; a bare-http deployment would need a different digest path entirely.
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build the kind:24242 authorization for one file.
 *
 * `x` binds the grant to this exact content. Without it the relay would accept
 * any bytes under a signature meant for something else, which is the whole point
 * of the header/tag pair being checked against each other.
 *
 * `serverHost` is passed in rather than read from the environment because the
 * relay compares it against the host the request bound to — a multi-tenant relay
 * tells one community's media store from another's this way, so it has to be
 * the host this upload is actually going to.
 */
export function buildUploadAuthTemplate(
  sha256: string,
  filename: string,
  nowSeconds: number,
  serverHost: string,
): EventTemplate {
  return {
    kind: KIND_BLOSSOM_AUTH,
    // BUD-11 requires a non-empty human-readable string; the relay rejects a
    // blank one, so this is not decoration.
    content: `Upload ${filename}`,
    created_at: nowSeconds,
    tags: [
      ["t", "upload"],
      ["x", sha256],
      ["expiration", String(nowSeconds + AUTH_LIFETIME_SECONDS)],
      ["server", serverHost],
    ],
  };
}

/**
 * The NIP-92 `imeta` tag for an uploaded attachment.
 *
 * Each entry is a `"<key> <value>"` string; the reader splits on the first space
 * only, so values containing spaces (a filename, alt text) survive intact.
 */
export function buildImetaTag(
  descriptor: BlobDescriptor,
  filename: string,
): string[] {
  const parts = [
    `url ${descriptor.url}`,
    `m ${descriptor.type}`,
    `x ${descriptor.sha256}`,
    `size ${descriptor.size}`,
  ];
  if (descriptor.dim) parts.push(`dim ${descriptor.dim}`);
  if (descriptor.blurhash) parts.push(`blurhash ${descriptor.blurhash}`);
  if (filename) parts.push(`filename ${filename}`);
  return ["imeta", ...parts];
}

/**
 * The markdown that puts an attachment in the message body.
 *
 * The renderer keys `imeta` off the URL it finds in the content, so an
 * attachment that never appears in the body is invisible no matter how complete
 * its tag is. Images use image syntax to become an `<img>` the `dim` hint can
 * size; anything else becomes a link, because inlining a video or a PDF as an
 * image would render a broken picture.
 */
export function markdownForAttachment(
  descriptor: BlobDescriptor,
  filename: string,
): string {
  const label = filename || descriptor.sha256.slice(0, 8);
  return descriptor.type.startsWith("image/")
    ? `![${label}](${descriptor.url})`
    : `[${label}](${descriptor.url})`;
}

/**
 * Map a relay rejection to something worth showing a person.
 *
 * The status alone is not actionable — "413" does not tell anyone what to do
 * about it — and the distinction that matters most (too large vs. not allowed
 * vs. relay trouble) is exactly what the status encodes.
 */
function uploadErrorFor(status: number, body: string): UploadError {
  const detail = body.trim().slice(0, 200);
  if (status === 413) {
    return new UploadError("That file is too large for this relay.");
  }
  if (status === 401 || status === 403) {
    return new UploadError(
      "This relay would not accept the upload from this identity.",
    );
  }
  if (status === 415) {
    return new UploadError("This relay does not accept that file type.");
  }
  return new UploadError(
    detail ? `Upload failed: ${detail}` : `Upload failed (${status}).`,
  );
}

/** How the module reaches the signer and the network, injected for testing. */
export interface UploadDeps {
  signEvent: (template: EventTemplate) => Promise<unknown>;
  fetchImpl?: typeof fetch;
  nowSeconds?: () => number;
  /** Relay HTTP base; defaults to this deployment's relay. */
  baseUrl?: string;
}

/**
 * Upload one file and return its descriptor.
 *
 * Rejects before reading the file when it is over {@link MAX_UPLOAD_BYTES}, so
 * an oversized pick never becomes an oversized allocation.
 */
export async function uploadFile(
  file: File,
  deps: UploadDeps,
): Promise<BlobDescriptor> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `That file is ${formatBytes(file.size)}; the limit is ${formatBytes(
        MAX_UPLOAD_BYTES,
      )}.`,
    );
  }

  const bytes = await file.arrayBuffer();
  const sha256 = await sha256Hex(bytes);
  const now = deps.nowSeconds?.() ?? Math.floor(Date.now() / 1000);
  const baseUrl = deps.baseUrl ?? relayHttpBaseUrl();

  const authEvent = await deps.signEvent(
    buildUploadAuthTemplate(sha256, file.name, now, new URL(baseUrl).host),
  );

  const doFetch = deps.fetchImpl ?? fetch;
  const response = await doFetch(`${baseUrl}/upload`, {
    method: "PUT",
    headers: {
      authorization: `Nostr ${btoa(JSON.stringify(authEvent))}`,
      // The relay checks this against the auth event's `x` tag, so the two must
      // be derived from the same bytes — they are, above.
      "x-sha-256": sha256,
      "content-type": file.type || "application/octet-stream",
    },
    body: bytes,
  });

  if (!response.ok) {
    throw uploadErrorFor(
      response.status,
      await response.text().catch(() => ""),
    );
  }

  const descriptor = (await response.json()) as BlobDescriptor;
  if (typeof descriptor?.url !== "string") {
    throw new UploadError("The relay accepted the upload but returned no URL.");
  }
  return descriptor;
}

/** Human-readable byte size, for limits and error text. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
