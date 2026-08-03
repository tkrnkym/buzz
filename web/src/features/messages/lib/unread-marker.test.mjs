import assert from "node:assert/strict";
import test from "node:test";

import { computeChannelUnreadMarker } from "@/features/messages/lib/unread-marker";

const ME = "e".repeat(64);
const ALICE = "a".repeat(64);

const row = (
  id,
  pubkey,
  createdAt,
  { system = false, parentId = null } = {},
) => ({
  message: {
    id,
    pubkey,
    content: id,
    createdAt,
    system,
    rootId: parentId,
    parentId,
  },
  content: id,
  edited: false,
  deleted: false,
  deletedReason: null,
  reactions: [],
  replyCount: 0,
});

test("the marker lands on the oldest message past the frontier", () => {
  const marker = computeChannelUnreadMarker(
    [row("m1", ALICE, 100), row("m2", ALICE, 200), row("m3", ALICE, 300)],
    150,
    ME,
  );
  assert.deepEqual(marker, { firstUnreadMessageId: "m2", unreadCount: 2 });
});

test("nothing past the frontier means no marker", () => {
  const marker = computeChannelUnreadMarker([row("m1", ALICE, 100)], 100, ME);
  assert.deepEqual(marker, { firstUnreadMessageId: null, unreadCount: 0 });
});

test("the frontier is exclusive — a message at it is read", () => {
  const marker = computeChannelUnreadMarker(
    [row("m1", ALICE, 200), row("m2", ALICE, 201)],
    200,
    ME,
  );
  assert.equal(marker.firstUnreadMessageId, "m2");
});

test("a never-read channel marks everything unread", () => {
  const marker = computeChannelUnreadMarker(
    [row("m1", ALICE, 100), row("m2", ALICE, 200)],
    null,
    ME,
  );
  assert.deepEqual(marker, { firstUnreadMessageId: "m1", unreadCount: 2 });
});

test("the reader's own messages never count as unread", () => {
  const marker = computeChannelUnreadMarker(
    [row("mine", ME, 200), row("theirs", ALICE, 300)],
    150,
    ME,
  );
  assert.deepEqual(marker, { firstUnreadMessageId: "theirs", unreadCount: 1 });
});

test("self-authorship is matched case-insensitively", () => {
  const marker = computeChannelUnreadMarker(
    [row("mine", ME.toUpperCase(), 200)],
    150,
    ME,
  );
  assert.equal(marker.firstUnreadMessageId, null);
});

test("replies do not drive the channel divider", () => {
  // A thread's unread state belongs to the thread panel; a reply here would put
  // the channel's "New" line above a message that is not in the timeline.
  const marker = computeChannelUnreadMarker(
    [row("reply", ALICE, 300, { parentId: "root" })],
    150,
    ME,
  );
  assert.deepEqual(marker, { firstUnreadMessageId: null, unreadCount: 0 });
});

test("system rows do not drive the divider either", () => {
  const marker = computeChannelUnreadMarker(
    [row("s1", ALICE, 300, { system: true })],
    150,
    ME,
  );
  assert.equal(marker.firstUnreadMessageId, null);
});

test("with no reader identity every unread message still counts", () => {
  const marker = computeChannelUnreadMarker([row("m1", ALICE, 300)], 150, null);
  assert.deepEqual(marker, { firstUnreadMessageId: "m1", unreadCount: 1 });
});
