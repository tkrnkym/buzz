import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChannelListFilter,
  buildChannelTimelineFilter,
  buildMessageTemplate,
  dedupeAddressable,
  eventToChannel,
  eventToMessage,
  mergeTimeline,
  parseThreadRefs,
  sortTimeline,
  toChannelList,
} from "@/features/chat/chat-model";

const event = (overrides) => ({
  id: "id",
  pubkey: "relay".padEnd(64, "0"),
  kind: 39000,
  created_at: 1_700_000_000,
  tags: [],
  content: "",
  sig: "sig".padEnd(128, "0"),
  ...overrides,
});

test("eventToChannel reads the NIP-29 metadata tags", () => {
  const channel = eventToChannel(
    event({
      tags: [
        ["d", "chan-1"],
        ["name", "general"],
        ["about", "Everything"],
        ["public"],
        ["closed"],
        ["t", "stream"],
        ["topic", "ship it"],
      ],
    }),
  );

  assert.deepEqual(channel, {
    id: "chan-1",
    name: "general",
    about: "Everything",
    topic: "ship it",
    type: "stream",
    isPrivate: false,
    hidden: false,
    archived: false,
    updatedAt: 1_700_000_000,
  });
});

test("eventToChannel treats a bare private tag as restricted", () => {
  const channel = eventToChannel(
    event({ tags: [["d", "chan-1"], ["name", "secret"], ["private"]] }),
  );
  assert.equal(channel.isPrivate, true);
});

test("eventToChannel rejects metadata with no d tag", () => {
  // Without `d` there is no channel id, and inventing one would file messages
  // under the wrong room.
  assert.equal(eventToChannel(event({ tags: [["name", "orphan"]] })), null);
});

test("eventToChannel ignores non-metadata kinds", () => {
  assert.equal(eventToChannel(event({ kind: 9, tags: [["d", "x"]] })), null);
});

test("dedupeAddressable keeps the newest generation per d tag", () => {
  const events = [
    event({
      id: "old",
      created_at: 100,
      tags: [
        ["d", "chan-1"],
        ["name", "old"],
      ],
    }),
    event({
      id: "new",
      created_at: 200,
      tags: [
        ["d", "chan-1"],
        ["name", "new"],
      ],
    }),
    event({
      id: "other",
      created_at: 150,
      tags: [
        ["d", "chan-2"],
        ["name", "two"],
      ],
    }),
  ];
  const deduped = dedupeAddressable(events)
    .map((e) => e.id)
    .sort();
  assert.deepEqual(deduped, ["new", "other"]);
});

test("toChannelList hides DMs and archived rooms and sorts by name", () => {
  const events = [
    event({
      id: "1",
      tags: [
        ["d", "c1"],
        ["name", "zebra"],
      ],
    }),
    event({
      id: "2",
      tags: [
        ["d", "c2"],
        ["name", "alpha"],
      ],
    }),
    event({
      id: "3",
      tags: [["d", "c3"], ["name", "a-dm"], ["hidden"], ["t", "dm"]],
    }),
    event({
      id: "4",
      tags: [
        ["d", "c4"],
        ["name", "gone"],
        ["archived", "true"],
      ],
    }),
  ];
  assert.deepEqual(
    toChannelList(events).map((channel) => channel.name),
    ["alpha", "zebra"],
  );
});

test("parseThreadRefs resolves a direct reply", () => {
  // buzz-sdk emits a single marked `reply` tag when root === parent.
  assert.deepEqual(
    parseThreadRefs(event({ kind: 9, tags: [["e", "root-1", "", "reply"]] })),
    { rootId: "root-1", parentId: "root-1" },
  );
});

test("parseThreadRefs resolves a nested reply", () => {
  assert.deepEqual(
    parseThreadRefs(
      event({
        kind: 9,
        tags: [
          ["e", "root-1", "", "root"],
          ["e", "parent-2", "", "reply"],
        ],
      }),
    ),
    { rootId: "root-1", parentId: "parent-2" },
  );
});

test("parseThreadRefs falls back to NIP-10 positional e tags", () => {
  assert.deepEqual(
    parseThreadRefs(
      event({
        kind: 9,
        tags: [
          ["e", "root-1"],
          ["e", "mid"],
          ["e", "parent-3"],
        ],
      }),
    ),
    { rootId: "root-1", parentId: "parent-3" },
  );
});

test("parseThreadRefs reports no thread for a root message", () => {
  assert.deepEqual(parseThreadRefs(event({ kind: 9, tags: [["h", "c1"]] })), {
    rootId: null,
    parentId: null,
  });
});

test("eventToMessage flags relay-authored system rows", () => {
  const message = eventToMessage(
    event({
      id: "sys",
      kind: 40099,
      content: '{"type":"channel_auto_archived"}',
    }),
  );
  assert.equal(message.system, true);

  const human = eventToMessage(event({ id: "msg", kind: 9, content: "hello" }));
  assert.equal(human.system, false);
});

test("eventToMessage accepts both stream message kinds", () => {
  // Kind 9 is what clients write; 40002 exists in stored history. Reading only
  // one of them silently loses messages.
  assert.ok(eventToMessage(event({ id: "a", kind: 9 })));
  assert.ok(eventToMessage(event({ id: "b", kind: 40002 })));
  assert.equal(eventToMessage(event({ id: "c", kind: 7 })), null);
});

test("mergeTimeline dedupes replayed events and keeps identity when unchanged", () => {
  const first = mergeTimeline(new Map(), [
    event({ id: "a", kind: 9, created_at: 10 }),
    event({ id: "b", kind: 9, created_at: 20 }),
  ]);
  assert.equal(first.size, 2);

  // A reconnect re-sends the same filter, so the same ids arrive again.
  const again = mergeTimeline(first, [
    event({ id: "a", kind: 9, created_at: 10 }),
  ]);
  assert.equal(again, first, "no new events must not produce a new Map");

  const grown = mergeTimeline(first, [
    event({ id: "c", kind: 9, created_at: 30 }),
  ]);
  assert.equal(grown.size, 3);
  assert.notEqual(grown, first);
});

test("sortTimeline orders oldest first and breaks ties deterministically", () => {
  const merged = mergeTimeline(new Map(), [
    event({ id: "bbb", kind: 9, created_at: 100 }),
    event({ id: "aaa", kind: 9, created_at: 100 }),
    event({ id: "ccc", kind: 9, created_at: 50 }),
  ]);
  assert.deepEqual(
    sortTimeline(merged).map((message) => message.id),
    ["ccc", "aaa", "bbb"],
  );
});

test("filters always carry explicit kinds", () => {
  // An open-ended filter trips the relay's p-gate and comes back 403.
  const timeline = buildChannelTimelineFilter("chan-1", 50);
  assert.deepEqual(timeline["#h"], ["chan-1"]);
  assert.ok(timeline.kinds.length > 0);
  assert.ok(timeline.kinds.includes(9) && timeline.kinds.includes(40002));

  const list = buildChannelListFilter(200);
  assert.deepEqual(list.kinds, [39000]);
});

test("buildMessageTemplate matches buzz-sdk build_message", () => {
  // kind 9 with an `h` tag carrying the channel UUID.
  assert.deepEqual(buildMessageTemplate("chan-1", "hi"), {
    kind: 9,
    tags: [["h", "chan-1"]],
    content: "hi",
  });
});
