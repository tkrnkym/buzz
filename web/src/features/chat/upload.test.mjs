import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_UPLOAD_BYTES,
  UploadError,
  buildImetaTag,
  buildUploadAuthTemplate,
  formatBytes,
  markdownForAttachment,
  sha256Hex,
  uploadFile,
} from "@/features/chat/upload";

const HASH = "ab".repeat(32);
const NOW = 1_700_000_000;

const descriptor = (overrides = {}) => ({
  url: "https://relay.test/media/abc.png",
  sha256: HASH,
  size: 1234,
  type: "image/png",
  uploaded: NOW,
  ...overrides,
});

test("the auth event binds the grant to this exact content", () => {
  // Without the `x` tag the relay would accept any bytes under a signature
  // meant for something else — it cross-checks this against the X-SHA-256
  // header, so the two must come from the same file.
  const template = buildUploadAuthTemplate(HASH, "cat.png", NOW, "relay.test");

  assert.equal(template.kind, 24242);
  assert.deepEqual(
    template.tags.find((tag) => tag[0] === "x"),
    ["x", HASH],
  );
  assert.deepEqual(
    template.tags.find((tag) => tag[0] === "t"),
    ["t", "upload"],
  );
});

test("the auth event expires, and not in the past", () => {
  const template = buildUploadAuthTemplate(HASH, "cat.png", NOW, "relay.test");
  const expiration = Number(
    template.tags.find((tag) => tag[0] === "expiration")?.[1],
  );
  assert.ok(expiration > NOW, "the relay rejects an already-expired grant");
});

test("the auth event carries a non-empty reason", () => {
  // BUD-11 requires a human-readable string and the relay rejects a blank one,
  // so an empty content field fails the upload rather than being cosmetic.
  const template = buildUploadAuthTemplate(HASH, "cat.png", NOW, "relay.test");
  assert.ok(template.content.trim().length > 0);
});

test("sha256 is lowercase hex of the right length", async () => {
  const hash = await sha256Hex(new TextEncoder().encode("hello").buffer);
  assert.match(hash, /^[0-9a-f]{64}$/);
  // Known digest of "hello" — this is the value the relay recomputes and
  // compares, so an encoding slip here fails every upload.
  assert.equal(
    hash,
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
});

test("an image attachment renders as an image, others as a link", () => {
  // The renderer keys imeta off the URL in the body, and inlining a PDF as an
  // image would render a broken picture.
  assert.equal(
    markdownForAttachment(descriptor(), "cat.png"),
    `![cat.png](https://relay.test/media/abc.png)`,
  );
  assert.equal(
    markdownForAttachment(
      descriptor({ type: "application/pdf", url: "https://relay.test/d.pdf" }),
      "notes.pdf",
    ),
    `[notes.pdf](https://relay.test/d.pdf)`,
  );
});

test("the imeta tag carries what the renderer needs to reserve space", () => {
  const tag = buildImetaTag(descriptor({ dim: "800x600" }), "cat.png");

  assert.equal(tag[0], "imeta");
  assert.ok(tag.includes("url https://relay.test/media/abc.png"));
  assert.ok(tag.includes("m image/png"));
  assert.ok(tag.includes(`x ${HASH}`));
  assert.ok(tag.includes("dim 800x600"), "without dim the timeline jumps");
});

test("absent optional metadata is omitted rather than sent empty", () => {
  const tag = buildImetaTag(descriptor(), "cat.png");
  assert.ok(!tag.some((part) => part.startsWith("dim")));
  assert.ok(!tag.some((part) => part.startsWith("blurhash")));
});

test("an oversized file is refused before it is read", async () => {
  // Hashing needs the whole file in memory, so accepting this would stall the
  // tab before the request could even be authorized.
  let read = false;
  const file = {
    name: "huge.bin",
    size: MAX_UPLOAD_BYTES + 1,
    type: "application/octet-stream",
    arrayBuffer: async () => {
      read = true;
      return new ArrayBuffer(0);
    },
  };

  await assert.rejects(
    () =>
      uploadFile(file, {
        signEvent: async () => ({}),
        baseUrl: "https://relay.test",
      }),
    UploadError,
  );
  assert.equal(read, false, "the file must not be read to reject it");
});

test("the request is authorized for the same bytes it sends", async () => {
  const bytes = new TextEncoder().encode("hello").buffer;
  const file = {
    name: "hello.txt",
    size: 5,
    type: "text/plain",
    arrayBuffer: async () => bytes,
  };

  let signedTemplate;
  let request;
  const result = await uploadFile(file, {
    baseUrl: "https://relay.test",
    nowSeconds: () => NOW,
    signEvent: async (template) => {
      signedTemplate = template;
      return { kind: template.kind, sig: "sig" };
    },
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify(descriptor()), { status: 200 });
    },
  });

  const expected = await sha256Hex(bytes);
  // The relay rejects the upload unless these two agree, so this is the whole
  // contract of the request.
  assert.equal(request.init.headers["x-sha-256"], expected);
  assert.deepEqual(
    signedTemplate.tags.find((tag) => tag[0] === "x"),
    ["x", expected],
  );
  assert.equal(request.init.method, "PUT");
  assert.match(request.init.headers.authorization, /^Nostr /);
  assert.equal(result.sha256, HASH);
});

test("a rejection is reported as something a person can act on", async () => {
  const file = {
    name: "big.png",
    size: 10,
    type: "image/png",
    arrayBuffer: async () => new ArrayBuffer(10),
  };

  await assert.rejects(
    () =>
      uploadFile(file, {
        baseUrl: "https://relay.test",
        signEvent: async () => ({}),
        fetchImpl: async () => new Response("nope", { status: 413 }),
      }),
    (error) => {
      assert.ok(error instanceof UploadError);
      // Not "413" — the status is not actionable on its own.
      assert.match(error.message, /too large/i);
      return true;
    },
  );
});

test("an accepted upload with no URL is still a failure", async () => {
  const file = {
    name: "a.png",
    size: 1,
    type: "image/png",
    arrayBuffer: async () => new ArrayBuffer(1),
  };

  await assert.rejects(
    () =>
      uploadFile(file, {
        baseUrl: "https://relay.test",
        signEvent: async () => ({}),
        fetchImpl: async () => new Response("{}", { status: 200 }),
      }),
    UploadError,
  );
});

test("sizes read as sizes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(100 * 1024 * 1024), "100 MB");
});
