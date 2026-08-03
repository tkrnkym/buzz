import assert from "node:assert/strict";
import test from "node:test";

import {
  buildThreadSummaries,
  threadRows,
} from "@/features/messages/lib/thread-summary";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const CAROL = "c".repeat(64);

const row = (
  id,
  pubkey,
  createdAt,
  { rootId = null, parentId = null, deleted = false } = {},
) => ({
  message: {
    id,
    pubkey,
    content: id,
    createdAt,
    system: false,
    rootId,
    parentId,
  },
  content: id,
  edited: false,
  deleted,
  deletedReason: null,
  reactions: [],
  replyCount: 0,
});

test("a thread summary counts every descendant, not just direct children", () => {
  // The timeline's count has to match what the panel shows, and the panel shows
  // the whole thread.
  const summaries = buildThreadSummaries([
    row("root", ALICE, 100),
    row("r1", BOB, 200, { rootId: "root", parentId: "root" }),
    row("r2", CAROL, 300, { rootId: "root", parentId: "r1" }),
  ]);
  assert.equal(summaries.get("root").replyCount, 2);
});

test("a one-level reply carries only a parent, and still counts", () => {
  // `parseThreadRefs` gives a direct reply one marked `e` tag that is both root
  // and parent; keying on rootId alone would lose every shallow thread.
  const summaries = buildThreadSummaries([
    row("root", ALICE, 100),
    row("r1", BOB, 200, { parentId: "root" }),
  ]);
  assert.equal(summaries.get("root").replyCount, 1);
});

test("the last reply time is the newest, whatever order rows arrive in", () => {
  const summaries = buildThreadSummaries([
    row("r2", CAROL, 300, { rootId: "root", parentId: "root" }),
    row("root", ALICE, 100),
    row("r1", BOB, 200, { rootId: "root", parentId: "root" }),
  ]);
  assert.equal(summaries.get("root").lastReplyAt, 300);
});

test("participants are distinct and in the order they spoke", () => {
  const summaries = buildThreadSummaries([
    row("root", ALICE, 100),
    row("r3", BOB, 400, { rootId: "root", parentId: "root" }),
    row("r1", CAROL, 200, { rootId: "root", parentId: "root" }),
    row("r2", BOB, 300, { rootId: "root", parentId: "root" }),
  ]);
  assert.deepEqual(summaries.get("root").participantPubkeys, [CAROL, BOB]);
});

test("a channel with no replies has no summaries", () => {
  const summaries = buildThreadSummaries([
    row("m1", ALICE, 100),
    row("m2", BOB, 200),
  ]);
  assert.equal(summaries.size, 0);
});

test("a deleted reply still counts", () => {
  // The thread happened. Hiding it would make the panel contradict the count.
  const summaries = buildThreadSummaries([
    row("root", ALICE, 100),
    row("r1", BOB, 200, { rootId: "root", parentId: "root", deleted: true }),
  ]);
  assert.equal(summaries.get("root").replyCount, 1);
});

test("two threads do not bleed into each other", () => {
  const summaries = buildThreadSummaries([
    row("rootA", ALICE, 100),
    row("rootB", ALICE, 110),
    row("a1", BOB, 200, { rootId: "rootA", parentId: "rootA" }),
    row("b1", CAROL, 300, { rootId: "rootB", parentId: "rootB" }),
    row("b2", CAROL, 400, { rootId: "rootB", parentId: "rootB" }),
  ]);
  assert.equal(summaries.get("rootA").replyCount, 1);
  assert.equal(summaries.get("rootB").replyCount, 2);
});

test("thread rows are the root followed by its replies, oldest first", () => {
  const rows = threadRows(
    [
      row("root", ALICE, 100),
      row("other", ALICE, 110),
      row("r2", CAROL, 300, { rootId: "root", parentId: "r1" }),
      row("r1", BOB, 200, { rootId: "root", parentId: "root" }),
    ],
    "root",
  );
  assert.deepEqual(
    rows.map((entry) => entry.message.id),
    ["root", "r1", "r2"],
  );
});

test("a thread whose root is not loaded renders nothing", () => {
  // Replies under no root would read as a channel, not as a thread.
  const rows = threadRows(
    [row("r1", BOB, 200, { rootId: "root", parentId: "root" })],
    "root",
  );
  assert.deepEqual(rows, []);
});

test("thread rows tie-break on the id so the order is stable", () => {
  const rows = threadRows(
    [
      row("root", ALICE, 100),
      row("zz", BOB, 200, { rootId: "root", parentId: "root" }),
      row("aa", CAROL, 200, { rootId: "root", parentId: "root" }),
    ],
    "root",
  );
  assert.deepEqual(
    rows.map((entry) => entry.message.id),
    ["root", "aa", "zz"],
  );
});
