import assert from "node:assert/strict";
import test from "node:test";

import {
  joinedChannelIds,
  partitionChannels,
  searchChannels,
} from "./channel-browser.ts";

const ME = "a".repeat(64);
const THEM = "b".repeat(64);

function memberList(channelId, members) {
  return {
    id: channelId.padEnd(64, "0"),
    pubkey: "f".repeat(64),
    kind: 39002,
    created_at: 1,
    tags: [["d", channelId], ...members.map((pubkey) => ["p", pubkey])],
    content: "",
    sig: "f".repeat(128),
  };
}

function channel(overrides) {
  return {
    id: "general",
    name: "general",
    about: null,
    topic: null,
    type: "stream",
    isPrivate: false,
    hidden: false,
    archived: false,
    participantPubkeys: [],
    updatedAt: 1,
    ...overrides,
  };
}

test("membership is read per channel, not flattened by person", () => {
  const joined = joinedChannelIds(
    [memberList("a", [ME, THEM]), memberList("b", [THEM])],
    ME,
  );
  assert.deepEqual([...joined], ["a"]);
});

test("without an identity nothing is joined", () => {
  assert.equal(joinedChannelIds([memberList("a", [ME])], null).size, 0);
});

test("a pubkey matches regardless of case", () => {
  const joined = joinedChannelIds([memberList("a", [ME.toUpperCase()])], ME);
  assert.deepEqual([...joined], ["a"]);
});

test("available holds the open rooms not yet joined", () => {
  const { joined, available } = partitionChannels({
    channels: [
      channel({ id: "in", name: "in" }),
      channel({ id: "out", name: "out" }),
    ],
    joinedIds: new Set(["in"]),
  });
  assert.deepEqual(
    joined.map((c) => c.id),
    ["in"],
  );
  assert.deepEqual(
    available.map((c) => c.id),
    ["out"],
  );
});

test("a private room is not offered", () => {
  // The relay would refuse the join; offering the button would be a lie.
  const { available } = partitionChannels({
    channels: [channel({ id: "secret", isPrivate: true })],
    joinedIds: new Set(),
  });
  assert.deepEqual(available, []);
});

test("a private room already joined still lists as joined", () => {
  const { joined } = partitionChannels({
    channels: [channel({ id: "secret", isPrivate: true })],
    joinedIds: new Set(["secret"]),
  });
  assert.deepEqual(
    joined.map((c) => c.id),
    ["secret"],
  );
});

test("DMs and archived rooms are in neither list", () => {
  const { joined, available } = partitionChannels({
    channels: [
      channel({ id: "dm", type: "dm" }),
      channel({ id: "old", archived: true }),
    ],
    joinedIds: new Set(["dm", "old"]),
  });
  assert.deepEqual(joined, []);
  assert.deepEqual(available, []);
});

test("search ranks a name prefix above a description match", () => {
  const hits = searchChannels(
    [
      channel({ id: "1", name: "random", about: "release chatter" }),
      channel({ id: "2", name: "releases", about: "" }),
      channel({ id: "3", name: "pre-release", about: "" }),
    ],
    "release",
  );
  assert.deepEqual(
    hits.map((c) => c.id),
    ["2", "3", "1"],
  );
});

test("a leading hash is ignored", () => {
  const hits = searchChannels([channel({ id: "1", name: "dev" })], "#dev");
  assert.equal(hits.length, 1);
});

test("an empty query returns everything, unreordered", () => {
  const all = [
    channel({ id: "b", name: "b" }),
    channel({ id: "a", name: "a" }),
  ];
  assert.deepEqual(searchChannels(all, "  "), all);
});
