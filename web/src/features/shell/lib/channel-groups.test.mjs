import assert from "node:assert/strict";
import test from "node:test";

import {
  compareChannelsByName,
  groupChannels,
  sortChannels,
} from "@/features/shell/lib/channel-groups";

const channel = (id, name, type = "stream") => ({
  id,
  name,
  about: null,
  topic: null,
  type,
  isPrivate: false,
  hidden: false,
  archived: false,
  updatedAt: 0,
});

const GENERAL = channel("c-general", "general");
const DESIGN = channel("c-design", "design");
const RANDOM = channel("c-random", "random");
const RFC = channel("c-rfc", "rfcs", "forum");

test("alphabetical order falls back to the id so it is total", () => {
  const first = channel("a", "same");
  const second = channel("b", "same");
  assert.ok(compareChannelsByName(first, second) < 0);
  assert.ok(compareChannelsByName(second, first) > 0);
  assert.equal(compareChannelsByName(first, first), 0);
});

test("recent order puts the newest activity first", () => {
  const activity = { "c-design": 300, "c-general": 100, "c-random": 200 };
  const sorted = sortChannels(
    [GENERAL, DESIGN, RANDOM],
    "recent",
    (id) => activity[id] ?? null,
  );
  assert.deepEqual(
    sorted.map((c) => c.id),
    ["c-design", "c-random", "c-general"],
  );
});

test("rooms with no observed activity sink to the bottom, alphabetically", () => {
  // The point of the alphabetical tail: a quiet channel keeps a stable position
  // instead of shuffling every time an activity snapshot arrives.
  const activity = { "c-random": 200 };
  const sorted = sortChannels(
    [GENERAL, DESIGN, RANDOM],
    "recent",
    (id) => activity[id] ?? null,
  );
  assert.deepEqual(
    sorted.map((c) => c.id),
    ["c-random", "c-design", "c-general"],
  );
});

test("recent order with no activity data at all is stable, not arbitrary", () => {
  const sorted = sortChannels([RANDOM, GENERAL, DESIGN], "recent");
  assert.deepEqual(
    sorted.map((c) => c.name),
    ["design", "general", "random"],
  );
});

test("sorting does not mutate the input", () => {
  const input = [RANDOM, GENERAL];
  const sorted = sortChannels(input, "alpha");
  assert.deepEqual(
    input.map((c) => c.id),
    ["c-random", "c-general"],
  );
  assert.notEqual(sorted, input);
});

test("forums are separated from streams", () => {
  const groups = groupChannels({
    channels: [GENERAL, RFC, DESIGN],
    starredChannelIds: new Set(),
  });
  const byKey = Object.fromEntries(
    groups.map((group) => [group.key, group.channels.map((c) => c.id)]),
  );
  assert.deepEqual(byKey.channels, ["c-design", "c-general"]);
  assert.deepEqual(byKey.forums, ["c-rfc"]);
  assert.deepEqual(byKey.starred, []);
});

test("a starred channel appears only under Starred", () => {
  // Listing it in both places would double every unread badge and make the
  // room count look wrong.
  const groups = groupChannels({
    channels: [GENERAL, DESIGN, RFC],
    starredChannelIds: new Set(["c-general", "c-rfc"]),
  });
  const byKey = Object.fromEntries(
    groups.map((group) => [group.key, group.channels.map((c) => c.id)]),
  );
  assert.deepEqual(byKey.starred, ["c-general", "c-rfc"]);
  assert.deepEqual(byKey.channels, ["c-design"]);
  assert.deepEqual(byKey.forums, []);
});

test("the group order is fixed regardless of what is populated", () => {
  const groups = groupChannels({
    channels: [RFC],
    starredChannelIds: new Set(),
  });
  assert.deepEqual(
    groups.map((group) => group.key),
    ["starred", "channels", "forums"],
  );
});

test("a star for a channel that is gone does not invent a row", () => {
  const groups = groupChannels({
    channels: [GENERAL],
    starredChannelIds: new Set(["c-vanished"]),
  });
  const starred = groups.find((group) => group.key === "starred");
  assert.deepEqual(starred.channels, []);
  const streams = groups.find((group) => group.key === "channels");
  assert.deepEqual(
    streams.channels.map((c) => c.id),
    ["c-general"],
  );
});
