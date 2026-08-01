import assert from "node:assert/strict";
import test from "node:test";

import {
  draftKey,
  draftKeys,
  DRAFT_TTL_MS,
  readDraft,
  storageKey,
  sweep,
  writeDraft,
} from "./drafts.ts";

/** Minimal in-memory Storage, enough for what this module calls. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    get size() {
      return map.size;
    },
    raw: map,
  };
}

const ME = "a".repeat(64);
const CHANNEL = "11111111-1111-1111-1111-111111111111";
const NOW = 1_700_000_000_000;

test("two identities do not share a slot", () => {
  assert.notEqual(storageKey(ME), storageKey("b".repeat(64)));
  assert.equal(storageKey(null), storageKey(null));
});

test("a thread's draft is separate from its channel's", () => {
  assert.notEqual(
    draftKey({ channelId: CHANNEL }),
    draftKey({ channelId: CHANNEL, threadRootId: "root" }),
  );
});

test("a draft is read back for the same composer", () => {
  const storage = fakeStorage();
  writeDraft(storage, ME, { channelId: CHANNEL }, "half a thought", NOW);
  assert.equal(
    readDraft(storage, ME, { channelId: CHANNEL }, NOW),
    "half a thought",
  );
});

test("another identity cannot read it", () => {
  const storage = fakeStorage();
  writeDraft(storage, ME, { channelId: CHANNEL }, "mine", NOW);
  assert.equal(
    readDraft(storage, "b".repeat(64), { channelId: CHANNEL }, NOW),
    "",
  );
});

test("a thread draft does not leak into the channel", () => {
  const storage = fakeStorage();
  writeDraft(
    storage,
    ME,
    { channelId: CHANNEL, threadRootId: "root" },
    "a reply",
    NOW,
  );
  assert.equal(readDraft(storage, ME, { channelId: CHANNEL }, NOW), "");
  assert.equal(
    readDraft(storage, ME, { channelId: CHANNEL, threadRootId: "root" }, NOW),
    "a reply",
  );
});

test("clearing the text removes the entry, not stores a blank", () => {
  const storage = fakeStorage();
  writeDraft(storage, ME, { channelId: CHANNEL }, "something", NOW);
  writeDraft(storage, ME, { channelId: CHANNEL }, "   ", NOW);
  assert.deepEqual(draftKeys(storage, ME, NOW), []);
  // The whole slot goes rather than an empty object being left behind.
  assert.equal(storage.size, 0);
});

test("a draft past the TTL is not restored", () => {
  const storage = fakeStorage();
  writeDraft(storage, ME, { channelId: CHANNEL }, "stale", NOW);
  const later = NOW + DRAFT_TTL_MS + 1;
  assert.equal(readDraft(storage, ME, { channelId: CHANNEL }, later), "");
});

test("writing sweeps other expired drafts", () => {
  const storage = fakeStorage();
  writeDraft(storage, ME, { channelId: "old" }, "stale", NOW);
  const later = NOW + DRAFT_TTL_MS + 1;
  writeDraft(storage, ME, { channelId: "new" }, "fresh", later);
  assert.deepEqual(draftKeys(storage, ME, later), ["new"]);
});

test("a malformed slot loses nothing else", () => {
  const storage = fakeStorage({
    [storageKey(ME)]: JSON.stringify({
      good: { text: "kept", at: NOW },
      bad: { text: 42 },
      alsoBad: "not an object",
    }),
  });
  assert.deepEqual(draftKeys(storage, ME, NOW), ["good"]);
});

test("unparseable JSON reads as no drafts", () => {
  const storage = fakeStorage({ [storageKey(ME)]: "{{{" });
  assert.deepEqual(draftKeys(storage, ME, NOW), []);
});

test("sweep reports whether it dropped anything", () => {
  const fresh = { a: { text: "x", at: NOW } };
  assert.equal(sweep(fresh, NOW).changed, false);
  assert.equal(sweep(fresh, NOW + DRAFT_TTL_MS + 1).changed, true);
});
