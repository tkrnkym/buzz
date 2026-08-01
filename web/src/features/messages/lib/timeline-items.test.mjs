import assert from "node:assert/strict";
import test from "node:test";

import {
  SYSTEM_GROUP_WINDOW_SECONDS,
  buildTimelineItems,
} from "@/features/messages/lib/timeline-items";
import { MESSAGE_GROUPING_WINDOW_SECONDS } from "@/features/messages/lib/message-grouping";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

/** Noon on a fixed local day, so day boundaries do not depend on the TZ. */
const DAY_ONE = Math.floor(new Date(2026, 2, 30, 12, 0).getTime() / 1000);
const DAY_TWO = Math.floor(new Date(2026, 2, 31, 12, 0).getTime() / 1000);

const row = (
  id,
  pubkey,
  createdAt,
  { system = false, parentId = null, deleted = false } = {},
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
  deleted,
  deletedReason: null,
  reactions: [],
  replyCount: 0,
});

const kinds = (items) => items.map((item) => item.kind);

test("a day divider opens the stream and marks each day boundary", () => {
  const items = buildTimelineItems({
    rows: [row("m1", ALICE, DAY_ONE), row("m2", ALICE, DAY_TWO)],
  });
  assert.deepEqual(kinds(items), [
    "day-divider",
    "message",
    "day-divider",
    "message",
  ]);
});

test("the day divider carries a timestamp, not a baked label", () => {
  // The render resolves "Today" against the current clock; a label frozen here
  // would keep calling yesterday "Today" in a tab left open overnight.
  const items = buildTimelineItems({ rows: [row("m1", ALICE, DAY_ONE)] });
  assert.equal(items[0].kind, "day-divider");
  assert.equal(items[0].headingTimestamp, DAY_ONE);
});

test("consecutive messages from one author group", () => {
  const items = buildTimelineItems({
    rows: [
      row("m1", ALICE, DAY_ONE),
      row("m2", ALICE, DAY_ONE + 30),
      row("m3", ALICE, DAY_ONE + 60),
    ],
  });
  const messages = items.filter((item) => item.kind === "message");
  assert.deepEqual(
    messages.map((item) => item.isContinuation),
    [false, true, true],
  );
  // The first two have something grouping below them; the last does not.
  assert.deepEqual(
    messages.map((item) => item.isFollowedByContinuation),
    [true, true, false],
  );
});

test("a different author breaks the group", () => {
  const items = buildTimelineItems({
    rows: [row("m1", ALICE, DAY_ONE), row("m2", BOB, DAY_ONE + 10)],
  });
  const messages = items.filter((item) => item.kind === "message");
  assert.deepEqual(
    messages.map((item) => item.isContinuation),
    [false, false],
  );
});

test("a gap past the grouping window breaks the group", () => {
  const items = buildTimelineItems({
    rows: [
      row("m1", ALICE, DAY_ONE),
      row("m2", ALICE, DAY_ONE + MESSAGE_GROUPING_WINDOW_SECONDS + 1),
    ],
  });
  const messages = items.filter((item) => item.kind === "message");
  assert.deepEqual(
    messages.map((item) => item.isContinuation),
    [false, false],
  );
});

test("a day divider breaks grouping even for the same author in window", () => {
  // A continuation directly under a divider would have no visible author.
  const lateOnDayOne = Math.floor(
    new Date(2026, 2, 30, 23, 58).getTime() / 1000,
  );
  const earlyOnDayTwo = Math.floor(
    new Date(2026, 2, 31, 0, 1).getTime() / 1000,
  );
  const items = buildTimelineItems({
    rows: [row("m1", ALICE, lateOnDayOne), row("m2", ALICE, earlyOnDayTwo)],
  });
  assert.deepEqual(kinds(items), [
    "day-divider",
    "message",
    "day-divider",
    "message",
  ]);
  const messages = items.filter((item) => item.kind === "message");
  assert.equal(messages[1].isContinuation, false);
});

test("the unread divider breaks grouping too", () => {
  const items = buildTimelineItems({
    rows: [
      row("m1", ALICE, DAY_ONE),
      row("m2", ALICE, DAY_ONE + 30),
      row("m3", ALICE, DAY_ONE + 60),
    ],
    firstUnreadMessageId: "m2",
  });
  assert.deepEqual(kinds(items), [
    "day-divider",
    "message",
    "unread-divider",
    "message",
    "message",
  ]);
  const messages = items.filter((item) => item.kind === "message");
  assert.deepEqual(
    messages.map((item) => item.isContinuation),
    [false, false, true],
  );
});

test("an unread id that is not loaded emits no divider", () => {
  const items = buildTimelineItems({
    rows: [row("m1", ALICE, DAY_ONE)],
    firstUnreadMessageId: "not-loaded",
  });
  assert.deepEqual(kinds(items), ["day-divider", "message"]);
});

test("replies are not in the timeline — they belong to the thread panel", () => {
  const items = buildTimelineItems({
    rows: [
      row("root", ALICE, DAY_ONE),
      row("reply", BOB, DAY_ONE + 10, { parentId: "root" }),
    ],
  });
  const messages = items.filter((item) => item.kind === "message");
  assert.deepEqual(
    messages.map((item) => item.row.message.id),
    ["root"],
  );
});

test("consecutive system rows collapse into one group", () => {
  const items = buildTimelineItems({
    rows: [
      row("s1", ALICE, DAY_ONE, { system: true }),
      row("s2", ALICE, DAY_ONE + 10, { system: true }),
      row("s3", ALICE, DAY_ONE + 20, { system: true }),
    ],
  });
  assert.deepEqual(kinds(items), ["day-divider", "system-group"]);
  assert.deepEqual(
    items[1].rows.map((entry) => entry.message.id),
    ["s1", "s2", "s3"],
  );
});

test("a system group is keyed on its first row so extending it does not remount", () => {
  const first = buildTimelineItems({
    rows: [row("s1", ALICE, DAY_ONE, { system: true })],
  });
  const extended = buildTimelineItems({
    rows: [
      row("s1", ALICE, DAY_ONE, { system: true }),
      row("s2", ALICE, DAY_ONE + 10, { system: true }),
    ],
  });
  assert.equal(first[1].key, extended[1].key);
});

test("system rows far apart do not collapse together", () => {
  const items = buildTimelineItems({
    rows: [
      row("s1", ALICE, DAY_ONE, { system: true }),
      row("s2", ALICE, DAY_ONE + SYSTEM_GROUP_WINDOW_SECONDS + 1, {
        system: true,
      }),
    ],
  });
  assert.deepEqual(kinds(items), [
    "day-divider",
    "system-group",
    "system-group",
  ]);
});

test("a system row between two messages breaks their grouping", () => {
  const items = buildTimelineItems({
    rows: [
      row("m1", ALICE, DAY_ONE),
      row("s1", ALICE, DAY_ONE + 10, { system: true }),
      row("m2", ALICE, DAY_ONE + 20),
    ],
  });
  const messages = items.filter((item) => item.kind === "message");
  assert.deepEqual(
    messages.map((item) => item.isContinuation),
    [false, false],
  );
});

test("a tombstone neither continues nor is continued", () => {
  // It has no author line, so grouping around it would hide whose message the
  // next line belongs to.
  const items = buildTimelineItems({
    rows: [
      row("m1", ALICE, DAY_ONE),
      row("m2", ALICE, DAY_ONE + 10, { deleted: true }),
      row("m3", ALICE, DAY_ONE + 20),
    ],
  });
  const messages = items.filter((item) => item.kind === "message");
  assert.deepEqual(
    messages.map((item) => item.isContinuation),
    [false, false, false],
  );
});

test("an empty channel produces no items at all", () => {
  assert.deepEqual(buildTimelineItems({ rows: [] }), []);
});

test("every key in the stream is unique", () => {
  const items = buildTimelineItems({
    rows: [
      row("m1", ALICE, DAY_ONE),
      row("s1", BOB, DAY_ONE + 10, { system: true }),
      row("m2", BOB, DAY_TWO),
    ],
    firstUnreadMessageId: "m2",
  });
  const keys = items.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length);
});
