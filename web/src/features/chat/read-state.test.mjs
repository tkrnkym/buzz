import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReadStateFilter,
  buildReadStateTemplate,
  fitsSlotBudget,
  foldReadState,
  isUnread,
  isValidBlob,
  isValidReadStateDTag,
  mergeContexts,
  nextCreatedAt,
} from "@/features/chat/read-state";

const SLOT = "0123456789abcdef0123456789abcdef";
const ME = "aa".repeat(32);

const readStateEvent = (slot, createdAt) => ({
  id: `id-${slot}-${createdAt}`,
  pubkey: ME,
  kind: 30078,
  created_at: createdAt,
  tags: [
    ["d", `read-state:${slot}`],
    ["t", "read-state"],
  ],
  content: "ciphertext",
  sig: "sig".padEnd(128, "0"),
});

test("the d tag must match the pattern the relay trigger enforces", () => {
  assert.equal(isValidReadStateDTag(`read-state:${SLOT}`), true);
  // 32 lowercase hex, exactly — the database trigger rejects anything else.
  assert.equal(isValidReadStateDTag("read-state:TOOSHORT"), false);
  assert.equal(isValidReadStateDTag(`read-state:${SLOT.toUpperCase()}`), false);
  assert.equal(isValidReadStateDTag(`read-state:${SLOT}extra`), false);
  assert.equal(isValidReadStateDTag("other:abc"), false);
  assert.equal(isValidReadStateDTag(undefined), false);
});

test("the publish template carries the tags the relay trigger requires", () => {
  const template = buildReadStateTemplate(SLOT, "cipher", 1_700_000_000);
  assert.equal(template.kind, 30078);
  assert.deepEqual(template.tags, [
    ["d", `read-state:${SLOT}`],
    // Exactly one two-element t tag; the trigger checks the length too.
    ["t", "read-state"],
  ]);
  assert.equal(template.created_at, 1_700_000_000);
});

test("nextCreatedAt always advances past the newest accepted write", () => {
  // A same-second republish is accepted only if the new event id happens to sort
  // lower — a coin flip. Advancing the timestamp is what makes the write reliable.
  assert.equal(nextCreatedAt(100, 100), 101);
  assert.equal(nextCreatedAt(100, 105), 106);
  assert.equal(nextCreatedAt(200, 100), 200);
  assert.equal(nextCreatedAt(100, 0), 100);
});

test("the read-state filter is scoped to the author and the t marker", () => {
  const filter = buildReadStateFilter(ME);
  assert.deepEqual(filter.kinds, [30078]);
  assert.deepEqual(filter.authors, [ME]);
  // kind:30078 also carries sections, mutes, and stars, so the marker is what
  // narrows the read to read-state.
  assert.deepEqual(filter["#t"], ["read-state"]);
});

test("isValidBlob rejects payloads that are not read state", () => {
  assert.equal(isValidBlob({ v: 1, client_id: "c", contexts: {} }), true);
  assert.equal(isValidBlob({ v: 2, client_id: "c", contexts: {} }), false);
  assert.equal(isValidBlob({ v: 1, client_id: "", contexts: {} }), false);
  assert.equal(isValidBlob({ v: 1, client_id: "c" }), false);
  assert.equal(isValidBlob({ v: 1, client_id: "c", contexts: [] }), false);
  assert.equal(isValidBlob(null), false);
  assert.equal(isValidBlob("nope"), false);
});

test("mergeContexts keeps the furthest-forward cursor", () => {
  assert.deepEqual(mergeContexts({ a: 10, b: 5 }, { a: 20, c: 1 }), {
    a: 20,
    b: 5,
    c: 1,
  });
  // Read state is grow-only, so an older cursor never wins.
  assert.deepEqual(mergeContexts({ a: 30 }, { a: 10 }), { a: 30 });
  assert.deepEqual(mergeContexts({}, { a: Number.NaN }), {});
});

test("foldReadState unions every device's slots", () => {
  const snapshot = foldReadState([
    {
      event: readStateEvent(SLOT, 100),
      blob: { v: 1, client_id: "desktop", contexts: { chan1: 50 } },
    },
    {
      event: readStateEvent("f".repeat(32), 200),
      blob: { v: 1, client_id: "web", contexts: { chan1: 40, chan2: 70 } },
    },
  ]);

  // A device that has not synced recently can only be behind, never wrong.
  assert.deepEqual(snapshot.contexts, { chan1: 50, chan2: 70 });
  assert.equal(snapshot.newestCreatedAt, 200);
  // The most recently written slot is reused, so revisiting does not add slots.
  assert.equal(snapshot.slotId, "f".repeat(32));
});

test("foldReadState ignores an event whose d tag the relay would reject", () => {
  const malformed = readStateEvent(SLOT, 100);
  malformed.tags = [
    ["d", "read-state:bogus"],
    ["t", "read-state"],
  ];
  const snapshot = foldReadState([
    { event: malformed, blob: { v: 1, client_id: "x", contexts: { c: 1 } } },
  ]);
  assert.deepEqual(snapshot.contexts, {});
  assert.equal(snapshot.slotId, null);
});

test("a channel is unread until its cursor covers the newest message", () => {
  assert.equal(isUnread({}, "chan1", 100), true, "never read");
  assert.equal(isUnread({ chan1: 50 }, "chan1", 100), true);
  assert.equal(isUnread({ chan1: 100 }, "chan1", 100), false);
  assert.equal(isUnread({ chan1: 150 }, "chan1", 100), false);
  // An empty channel cannot be unread.
  assert.equal(isUnread({}, "chan1", null), false);
});

test("fitsSlotBudget refuses a blob past the per-slot plaintext budget", () => {
  const small = { v: 1, client_id: "web", contexts: { chan1: 1 } };
  assert.equal(fitsSlotBudget(small), true);

  const contexts = {};
  for (let index = 0; index < 2_000; index += 1) {
    contexts[`channel-${index}-${"x".repeat(20)}`] = 1_700_000_000;
  }
  assert.equal(
    fitsSlotBudget({ v: 1, client_id: "web", contexts }),
    false,
    "32 KB is the budget NIP-44 and the relay leave room for",
  );
});
