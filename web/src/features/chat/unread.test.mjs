import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActivityFilter,
  isChannelUnread,
  mergeActivity,
  parseActivitySnapshot,
} from "@/features/chat/unread";
import { UNREAD_HORIZON_SECONDS } from "@/features/chat/chat-model";
import { KIND_CHANNEL_ACTIVITY_SNAPSHOT } from "@/shared/constants/kinds";

const NOW = 1_700_000_000;

const snapshot = (channels, shard = 0) => ({
  id: "aa".repeat(32),
  pubkey: "bb".repeat(32),
  kind: KIND_CHANNEL_ACTIVITY_SNAPSHOT,
  created_at: NOW,
  tags: [["d", `activity:${shard}`]],
  content: JSON.stringify({ shard, channels }),
  sig: "cc".repeat(64),
});

test("the badge subscription asks for one kind and nothing else", () => {
  // No channel or author scoping: the relay decides which shards this reader
  // may see and addresses them. Narrowing here would only risk missing one.
  assert.deepEqual(buildActivityFilter(), {
    kinds: [KIND_CHANNEL_ACTIVITY_SNAPSHOT],
  });
});

test("a snapshot yields its channel timestamps", () => {
  assert.deepEqual(
    parseActivitySnapshot(snapshot({ "chan-1": 500, "chan-2": 900 })),
    { "chan-1": 500, "chan-2": 900 },
  );
});

test("a malformed snapshot costs its own badges, not every badge", () => {
  // Each of these must degrade to "this shard told us nothing" rather than
  // throwing, which would take out the whole sidebar.
  for (const content of [
    "not json",
    "null",
    "[]",
    '{"shard":0}',
    '{"shard":0,"channels":null}',
    '{"shard":0,"channels":"nope"}',
  ]) {
    assert.deepEqual(
      parseActivitySnapshot({ ...snapshot({}), content }),
      {},
      `must not throw for ${content}`,
    );
  }
});

test("non-numeric timestamps are dropped, not coerced", () => {
  assert.deepEqual(
    parseActivitySnapshot({
      ...snapshot({}),
      content: JSON.stringify({
        shard: 0,
        channels: { good: 500, bad: "500", worse: null, nan: Number.NaN },
      }),
    }),
    { good: 500 },
  );
});

test("shards merge instead of replacing each other", () => {
  // Each event carries only its own shard. Replacing would leave a client
  // holding whichever shard arrived most recently and nothing else.
  const afterFirst = mergeActivity({}, { "chan-1": 500 });
  const afterSecond = mergeActivity(afterFirst, { "chan-2": 900 });

  assert.deepEqual(afterSecond, { "chan-1": 500, "chan-2": 900 });
});

test("a re-delivered older snapshot cannot walk activity backwards", () => {
  const current = { "chan-1": 900 };
  assert.deepEqual(mergeActivity(current, { "chan-1": 500 }), {
    "chan-1": 900,
  });
});

test("an unchanged shard returns the same reference", () => {
  // Identity is what keeps the sidebar from re-rendering once per coalescing
  // window on a community where nothing moved.
  const current = { "chan-1": 900 };
  assert.equal(mergeActivity(current, { "chan-1": 900 }), current);
  assert.equal(mergeActivity(current, {}), current);
});

test("a channel is unread when it moved past the cursor", () => {
  assert.equal(
    isChannelUnread("chan-1", { "chan-1": 900 }, { "chan-1": 500 }, NOW),
    true,
  );
});

test("a channel read up to its newest activity is not unread", () => {
  // Equal, not greater: the cursor covers that message, so a badge here would
  // never clear.
  assert.equal(
    isChannelUnread("chan-1", { "chan-1": 900 }, { "chan-1": 900 }, NOW),
    false,
  );
});

test("a channel with no activity at all is not unread", () => {
  assert.equal(isChannelUnread("chan-1", {}, {}, NOW), false);
});

test("a never-read channel is unread only inside the horizon", () => {
  const insideHorizon = NOW - UNREAD_HORIZON_SECONDS + 10;
  const outsideHorizon = NOW - UNREAD_HORIZON_SECONDS - 10;

  assert.equal(
    isChannelUnread("chan-1", { "chan-1": insideHorizon }, {}, NOW),
    true,
  );
  assert.equal(
    isChannelUnread("chan-1", { "chan-1": outsideHorizon }, {}, NOW),
    false,
    "a room whose newest message is months old is noise, not information",
  );
});
