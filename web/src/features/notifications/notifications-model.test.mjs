import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDmMessagesFilter,
  buildMentionFilter,
  buildNotifications,
  buildOwnMessagesFilter,
  buildRepliesFilter,
  isNotificationUnread,
  notificationTitle,
  truncateBody,
  unreadNotificationCount,
} from "@/features/notifications/notifications-model";

const ME = "1a".repeat(32);
const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const CHANNEL = "11111111-1111-1111-1111-111111111111";
const DM = "55555555-5555-5555-5555-555555555555";

const message = (id, pubkey, tags, content = "hello", createdAt = 1000) => ({
  id: id.repeat(64).slice(0, 64),
  pubkey,
  kind: 9,
  created_at: createdAt,
  tags,
  content,
  sig: "f".repeat(128),
});

const base = {
  dmChannelIds: new Set([DM]),
  myPubkey: ME,
  ownMessageIds: new Set(),
};

test("the mention filter names both message kinds and the reader", () => {
  const filter = buildMentionFilter(ME.toUpperCase(), 20);
  assert.deepEqual(filter.kinds, [9, 40002]);
  assert.deepEqual(filter["#p"], [ME]);
  assert.equal(filter.limit, 20);
});

test("the own-messages filter is authored, not tagged", () => {
  const filter = buildOwnMessagesFilter(ME);
  assert.deepEqual(filter.authors, [ME]);
  assert.equal(filter["#p"], undefined);
});

test("a DM is found by channel, not by a p tag on the message", () => {
  // A DM's participants live on the channel metadata; its messages carry only
  // the `h` tag. Scoping by `#p` alone would find only the DMs that happen to
  // also mention someone by name.
  const filter = buildDmMessagesFilter([DM, DM, ""]);
  assert.deepEqual(filter["#h"], [DM]);
  assert.deepEqual(filter.kinds, [9, 40002]);
  // No DMs, no filter — an empty `#h` would match the whole community.
  assert.equal(buildDmMessagesFilter([]), null);
});

test("with no own messages there is no reply filter to open", () => {
  // An empty `#e` is a filter a relay may read as "any event" — which would turn
  // a notification list into the whole community.
  assert.equal(buildRepliesFilter([]), null);
  assert.equal(buildRepliesFilter(["", ""]), null);
});

test("the reply filter deduplicates the ids it watches", () => {
  const filter = buildRepliesFilter(["a", "a", "b"]);
  assert.deepEqual(filter["#e"], ["a", "b"]);
});

test("a message naming the reader is a mention", () => {
  const items = buildNotifications({
    ...base,
    events: [
      message("1", ALICE, [
        ["h", CHANNEL],
        ["p", ME],
      ]),
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].category, "mention");
  assert.equal(items[0].authorPubkey, ALICE);
  assert.equal(items[0].channelId, CHANNEL);
});

test("a message in a DM is a DM, even when it also names the reader", () => {
  // Being mentioned inside a DM you are already in is not news; "someone
  // messaged you directly" is the useful label.
  const items = buildNotifications({
    ...base,
    events: [
      message("1", ALICE, [
        ["h", DM],
        ["p", ME],
      ]),
    ],
  });
  assert.equal(items[0].category, "dm");
});

test("a message referencing the reader's own event is a reply", () => {
  const mine = message("9", ME, [["h", CHANNEL]]).id;
  const items = buildNotifications({
    ...base,
    ownMessageIds: new Set([mine]),
    events: [
      message("1", ALICE, [
        ["h", CHANNEL],
        ["e", mine, "", "reply"],
      ]),
    ],
  });
  assert.equal(items[0].category, "reply");
});

test("a message that is neither addressed nor a reply is not a notification", () => {
  const items = buildNotifications({
    ...base,
    events: [message("1", ALICE, [["h", CHANNEL]])],
  });
  assert.deepEqual(items, []);
});

test("the reader's own message never notifies them", () => {
  // Sending is not being notified, and a p tag naming yourself is easy to
  // produce by accident.
  const items = buildNotifications({
    ...base,
    events: [
      message("1", ME, [
        ["h", CHANNEL],
        ["p", ME],
      ]),
    ],
  });
  assert.deepEqual(items, []);
});

test("a muted author raises nothing", () => {
  const items = buildNotifications({
    ...base,
    mutedPubkeys: new Set([ALICE]),
    events: [
      message("1", ALICE, [
        ["h", CHANNEL],
        ["p", ME],
      ]),
      message("2", BOB, [
        ["h", CHANNEL],
        ["p", ME],
      ]),
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].authorPubkey, BOB);
});

test("the same event arriving on two filters yields one row", () => {
  // The filters overlap by design, and a reconnect re-sends all of them.
  const event = message("1", ALICE, [
    ["h", DM],
    ["p", ME],
  ]);
  const items = buildNotifications({ ...base, events: [event, event] });
  assert.equal(items.length, 1);
});

test("rows are newest first, ties broken by id", () => {
  const items = buildNotifications({
    ...base,
    events: [
      message(
        "1",
        ALICE,
        [
          ["h", CHANNEL],
          ["p", ME],
        ],
        "old",
        100,
      ),
      message(
        "2",
        ALICE,
        [
          ["h", CHANNEL],
          ["p", ME],
        ],
        "new",
        300,
      ),
      message(
        "3",
        ALICE,
        [
          ["h", CHANNEL],
          ["p", ME],
        ],
        "mid",
        200,
      ),
    ],
  });
  assert.deepEqual(
    items.map((item) => item.content),
    ["new", "mid", "old"],
  );
});

test("without an identity there is nothing to notify", () => {
  assert.deepEqual(
    buildNotifications({
      ...base,
      myPubkey: null,
      events: [
        message("1", ALICE, [
          ["h", CHANNEL],
          ["p", ME],
        ]),
      ],
    }),
    [],
  );
});

test("unread is measured against the channel cursor", () => {
  const item = { id: "x", channelId: CHANNEL, createdAt: 200 };
  // Read past it.
  assert.equal(isNotificationUnread(item, { [CHANNEL]: 300 }), false);
  // Read, but not this far.
  assert.equal(isNotificationUnread(item, { [CHANNEL]: 100 }), true);
  // Never read.
  assert.equal(isNotificationUnread(item, {}), true);
});

test("a notification with no channel is always unread", () => {
  // There is no cursor that could clear it, and hiding it would be the worse lie.
  assert.equal(
    isNotificationUnread({ channelId: null, createdAt: 1 }, {}),
    true,
  );
});

test("the unread count counts only what the cursors leave unread", () => {
  const items = [
    { id: "a", channelId: CHANNEL, createdAt: 100 },
    { id: "b", channelId: CHANNEL, createdAt: 400 },
    { id: "c", channelId: DM, createdAt: 50 },
  ];
  assert.equal(unreadNotificationCount(items, { [CHANNEL]: 200 }), 2);
});

test("a body is truncated on characters, with a fallback for an empty one", () => {
  assert.equal(truncateBody("  短い  "), "短い");
  assert.equal(truncateBody("   ", "画像"), "画像");
  const long = "あ".repeat(200);
  const short = truncateBody(long);
  assert.equal(short.length, 141);
  assert.ok(short.endsWith("…"));
});

test("a title says who, and where when there is a room to name", () => {
  const mention = { category: "mention" };
  assert.equal(
    notificationTitle(mention, { authorLabel: "彩", channelName: "general" }),
    "彩 が #general であなたに言及",
  );
  // No room known yet — still a usable sentence.
  assert.equal(
    notificationTitle(mention, { authorLabel: "彩" }),
    "彩 があなたに言及",
  );
  // A DM has no useful room label, and "#彩" reads as a channel.
  assert.equal(
    notificationTitle({ category: "dm" }, { authorLabel: "彩" }),
    "彩 からのDM",
  );
  assert.equal(
    notificationTitle(
      { category: "reply" },
      {
        authorLabel: "健",
        channelName: "dev",
      },
    ),
    "健 が #dev で返信",
  );
});
