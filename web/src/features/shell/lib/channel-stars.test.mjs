import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_STORE,
  parseChannelStars,
  storageKey,
  toggleChannelStar,
} from "@/features/shell/lib/channel-stars";

test("the key is scoped to the identity", () => {
  // Two identities in one browser must not see each other's stars — the key is
  // the only thing keeping them apart.
  assert.notEqual(storageKey("a".repeat(64)), storageKey("b".repeat(64)));
  assert.ok(storageKey("abc").includes("abc"));
});

test("a payload from an unknown version is rejected, not guessed at", () => {
  assert.equal(parseChannelStars({ version: 2, channelIds: ["a"] }), null);
  assert.equal(parseChannelStars({ channelIds: ["a"] }), null);
  assert.equal(parseChannelStars(null), null);
  assert.equal(parseChannelStars("[]"), null);
  assert.equal(parseChannelStars({ version: 1 }), null);
});

test("garbage entries are dropped without losing the good ones", () => {
  const parsed = parseChannelStars({
    version: 1,
    channelIds: ["keep", 42, null, "", { id: "x" }, "also-keep"],
  });
  assert.deepEqual(parsed.channelIds, ["keep", "also-keep"]);
});

test("duplicates in storage collapse to one star", () => {
  const parsed = parseChannelStars({
    version: 1,
    channelIds: ["dup", "dup", "other"],
  });
  assert.deepEqual(parsed.channelIds, ["dup", "other"]);
});

test("toggling adds then removes", () => {
  const added = toggleChannelStar(EMPTY_STORE, "c-1");
  assert.deepEqual(added.channelIds, ["c-1"]);
  const removed = toggleChannelStar(added, "c-1");
  assert.deepEqual(removed.channelIds, []);
});

test("toggling never mutates the store it was given", () => {
  const before = { version: 1, channelIds: ["c-1"] };
  toggleChannelStar(before, "c-2");
  assert.deepEqual(before.channelIds, ["c-1"]);
});

test("starring appends so the reader's own ordering survives", () => {
  let store = EMPTY_STORE;
  for (const id of ["c-3", "c-1", "c-2"]) {
    store = toggleChannelStar(store, id);
  }
  assert.deepEqual(store.channelIds, ["c-3", "c-1", "c-2"]);
});
