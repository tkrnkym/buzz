import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_STORE,
  parseChannelFlags,
  storageKey,
  toggleChannelFlag,
} from "@/features/shell/lib/channel-flags";

test("the key is scoped to both the flag and the identity", () => {
  // Two identities in one browser must not see each other's preferences, and a
  // star must not double as a mute.
  assert.notEqual(storageKey("stars", "a"), storageKey("stars", "b"));
  assert.notEqual(storageKey("stars", "a"), storageKey("mutes", "a"));
  assert.ok(storageKey("stars", "abc").includes("abc"));
});

test("a payload from an unknown version is rejected, not guessed at", () => {
  assert.equal(parseChannelFlags({ version: 2, channelIds: ["a"] }), null);
  assert.equal(parseChannelFlags({ channelIds: ["a"] }), null);
  assert.equal(parseChannelFlags(null), null);
  assert.equal(parseChannelFlags("[]"), null);
  assert.equal(parseChannelFlags({ version: 1 }), null);
});

test("garbage entries are dropped without losing the good ones", () => {
  const parsed = parseChannelFlags({
    version: 1,
    channelIds: ["keep", 42, null, "", { id: "x" }, "also-keep"],
  });
  assert.deepEqual(parsed.channelIds, ["keep", "also-keep"]);
});

test("duplicates in storage collapse to one entry", () => {
  const parsed = parseChannelFlags({
    version: 1,
    channelIds: ["dup", "dup", "other"],
  });
  assert.deepEqual(parsed.channelIds, ["dup", "other"]);
});

test("toggling adds then removes", () => {
  const added = toggleChannelFlag(EMPTY_STORE, "c-1");
  assert.deepEqual(added.channelIds, ["c-1"]);
  const removed = toggleChannelFlag(added, "c-1");
  assert.deepEqual(removed.channelIds, []);
});

test("toggling never mutates the store it was given", () => {
  const before = { version: 1, channelIds: ["c-1"] };
  toggleChannelFlag(before, "c-2");
  assert.deepEqual(before.channelIds, ["c-1"]);
});

test("entries append, so the reader's own ordering survives", () => {
  let store = EMPTY_STORE;
  for (const id of ["c-3", "c-1", "c-2"]) {
    store = toggleChannelFlag(store, id);
  }
  assert.deepEqual(store.channelIds, ["c-3", "c-1", "c-2"]);
});
