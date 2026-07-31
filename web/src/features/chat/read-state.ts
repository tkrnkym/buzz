/**
 * Read state, stored on the relay rather than in the browser.
 *
 * A read position is per-person state that has to follow the person across
 * devices, so it lives on the relay as a kind:30078 addressable event — not in
 * browser storage. The payload is NIP-44 encrypted to the author's own key, so
 * the relay operator holds ciphertext instead of a record of what each person has
 * read.
 *
 * Wire format is the one the desktop client established before it was removed,
 * kept so existing read-state events stay readable:
 *
 *   kind:    30078
 *   tags:    ["d", "read-state:<32 hex>"], ["t", "read-state"]
 *   content: NIP-44 ciphertext of {"v":1,"client_id":"…","contexts":{…}}
 *
 * `contexts` maps a context key to a unix-seconds read cursor. This client writes
 * channel-id keys; the desktop `msg:<id>` / `thread:<id>` markers are read
 * through untouched so a shared blob is never narrowed by a round trip here.
 *
 * Three relay-side rules are enforced by database trigger (migration
 * `0009_nip_rs_database_guards.sql`) and silently reject a write that breaks them:
 *
 * 1. `d` must match `^read-state:[0-9a-f]{32}$`.
 * 2. Exactly one two-element `["t","read-state"]` tag must be present.
 * 3. The write must *advance the watermark* — a same-second republish is
 *    accepted only if the new event id happens to sort lower, which is
 *    effectively a coin flip. {@link nextCreatedAt} is what keeps this honest.
 */

import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";

import { KIND_READ_STATE } from "@/shared/constants/kinds";

export const READ_STATE_D_TAG_PREFIX = "read-state:";
export const READ_STATE_FETCH_LIMIT = 500;
/** NIP-44 caps plaintext at 65,535 bytes; desktop budgets 32 KB per slot. */
export const READ_STATE_MAX_PLAINTEXT_BYTES = 32_768;
export const MAX_CONTEXTS = 10_000;

export interface ReadStateBlob {
  v: 1;
  client_id: string;
  contexts: Record<string, number>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate a decrypted payload before trusting it as read state. */
export function isValidBlob(value: unknown): value is ReadStateBlob {
  if (!isPlainRecord(value)) return false;
  if (value.v !== 1) return false;
  if (
    typeof value.client_id !== "string" ||
    value.client_id.length === 0 ||
    value.client_id.length > 64
  ) {
    return false;
  }
  if (!isPlainRecord(value.contexts)) return false;
  if (Object.keys(value.contexts).length > MAX_CONTEXTS) return false;
  return true;
}

const SLOT_PATTERN = /^[0-9a-f]{32}$/;

/** Whether a `d` tag is a well-formed read-state slot the relay will accept. */
export function isValidReadStateDTag(value: string | undefined): boolean {
  if (!value?.startsWith(READ_STATE_D_TAG_PREFIX)) return false;
  return SLOT_PATTERN.test(value.slice(READ_STATE_D_TAG_PREFIX.length));
}

export function readStateDTag(slotId: string): string {
  return `${READ_STATE_D_TAG_PREFIX}${slotId}`;
}

/** Own read-state events. Scoped to the author: this is nobody else's business. */
export function buildReadStateFilter(pubkey: string): NostrFilter {
  return {
    kinds: [KIND_READ_STATE],
    authors: [pubkey],
    "#t": ["read-state"],
    limit: READ_STATE_FETCH_LIMIT,
  };
}

/**
 * `created_at` for the next publish.
 *
 * The relay's watermark trigger rejects a write that does not advance past the
 * newest accepted event for this `(pubkey, d)`. Clock resolution is one second,
 * so a quick second mark-read would otherwise collide and be dropped — with no
 * error the user could act on.
 */
export function nextCreatedAt(nowSeconds: number, newestSeen: number): number {
  return Math.max(nowSeconds, newestSeen + 1);
}

/** Merge two context maps, keeping the furthest-forward cursor per key. */
export function mergeContexts(
  base: Record<string, number>,
  incoming: Record<string, number>,
): Record<string, number> {
  const merged = { ...base };
  for (const [key, cursor] of Object.entries(incoming)) {
    if (!Number.isFinite(cursor)) continue;
    const current = merged[key];
    if (current === undefined || cursor > current) {
      merged[key] = cursor;
    }
  }
  return merged;
}

export interface ReadStateSnapshot {
  contexts: Record<string, number>;
  /** Newest `created_at` observed, for {@link nextCreatedAt}. */
  newestCreatedAt: number;
  /** Slot this client publishes into. */
  slotId: string | null;
}

export const EMPTY_READ_STATE: ReadStateSnapshot = {
  contexts: {},
  newestCreatedAt: 0,
  slotId: null,
};

/**
 * Fold decrypted read-state events into one snapshot.
 *
 * Every slot from every device contributes: read state is grow-only, so the union
 * of cursors is the correct answer and a device that has not synced recently can
 * only ever be behind, never wrong.
 */
export function foldReadState(
  entries: Array<{ event: NostrEvent; blob: ReadStateBlob }>,
): ReadStateSnapshot {
  let contexts: Record<string, number> = {};
  let newestCreatedAt = 0;
  let slotId: string | null = null;
  let slotCreatedAt = -1;

  for (const { event, blob } of entries) {
    const dTag = event.tags.find((tag) => tag[0] === "d")?.[1];
    if (dTag === undefined || !isValidReadStateDTag(dTag)) continue;

    contexts = mergeContexts(contexts, blob.contexts);
    if (event.created_at > newestCreatedAt) {
      newestCreatedAt = event.created_at;
    }
    // Reuse the most recently written slot, so a returning browser keeps
    // extending one event instead of adding a slot per visit.
    if (event.created_at > slotCreatedAt) {
      slotCreatedAt = event.created_at;
      slotId = dTag.slice(READ_STATE_D_TAG_PREFIX.length);
    }
  }

  return { contexts, newestCreatedAt, slotId };
}

/**
 * Whether a channel has unread messages.
 *
 * `latestActivityAt` is the newest message in the channel; a message authored by
 * the reader never counts, since sending is reading.
 */
export function isUnread(
  contexts: Record<string, number>,
  channelId: string,
  latestActivityAt: number | null,
): boolean {
  if (latestActivityAt === null) return false;
  const cursor = contexts[channelId];
  return cursor === undefined || latestActivityAt > cursor;
}

/** Blob to publish, given the merged cursors. */
export function buildReadStateBlob(
  clientId: string,
  contexts: Record<string, number>,
): ReadStateBlob {
  return { v: 1, client_id: clientId, contexts };
}

/**
 * Event template for a read-state publish.
 *
 * Tag order and shape are load-bearing: the relay trigger checks for exactly one
 * two-element `["t","read-state"]` tag and a conforming `d`.
 */
export function buildReadStateTemplate(
  slotId: string,
  ciphertext: string,
  createdAt: number,
): { kind: number; tags: string[][]; content: string; created_at: number } {
  return {
    kind: KIND_READ_STATE,
    tags: [
      ["d", readStateDTag(slotId)],
      ["t", "read-state"],
    ],
    content: ciphertext,
    created_at: createdAt,
  };
}

/** Whether a blob's plaintext fits the per-slot budget. */
export function fitsSlotBudget(blob: ReadStateBlob): boolean {
  return (
    new TextEncoder().encode(JSON.stringify(blob)).length <=
    READ_STATE_MAX_PLAINTEXT_BYTES
  );
}
