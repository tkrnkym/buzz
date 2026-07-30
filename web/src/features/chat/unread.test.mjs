import assert from "node:assert/strict";
import test from "node:test";

import {
  UNREAD_PROBE_MAX_FILTERS,
  buildUnreadProbeFilters,
  channelsWithActivity,
} from "@/features/chat/unread";
import { UNREAD_HORIZON_SECONDS } from "@/features/chat/chat-model";

const NOW = 1_700_000_000;

test("each channel contributes one bounded filter", () => {
  const [filters] = buildUnreadProbeFilters(
    ["chan-1", "chan-2"],
    { "chan-1": 500 },
    NOW,
  );

  assert.equal(filters.length, 2);
  for (const filter of filters) {
    // The question is "any?", not "how many?" — one event is the whole answer.
    assert.equal(filter.limit, 1);
    assert.ok(filter.kinds.includes(9) && filter.kinds.includes(40002));
    assert.equal(filter["#h"].length, 1);
  }
});

test("a read channel is probed from just past its cursor", () => {
  // Nostr's `since` is inclusive and the cursor itself has been read, so probing
  // from the cursor would report every already-read channel as unread.
  const [[filter]] = buildUnreadProbeFilters(
    ["chan-1"],
    { "chan-1": 500 },
    NOW,
  );
  assert.equal(filter.since, 501);
});

test("an unread channel is probed over the horizon, not all history", () => {
  // A badge for a room whose newest message is months old is noise.
  const [[filter]] = buildUnreadProbeFilters(["chan-1"], {}, NOW);
  assert.equal(filter.since, NOW - UNREAD_HORIZON_SECONDS);
});

test("probes are split so one request body stays bounded", () => {
  const channels = Array.from(
    { length: UNREAD_PROBE_MAX_FILTERS * 2 + 5 },
    (_unused, index) => `chan-${index}`,
  );
  const chunks = buildUnreadProbeFilters(channels, {}, NOW);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, UNREAD_PROBE_MAX_FILTERS);
  assert.equal(chunks[2].length, 5);
  assert.equal(
    chunks.flat().length,
    channels.length,
    "every channel is asked about exactly once",
  );
});

test("no channels means no request", () => {
  assert.deepEqual(buildUnreadProbeFilters([], {}, NOW), []);
});

test("each returned event names its own channel", () => {
  // This is what lets one response answer every filter it carried, without the
  // caller tracking which filter produced what.
  const event = (channelId) => ({
    id: `id-${channelId}`,
    pubkey: "aa".repeat(32),
    kind: 9,
    created_at: NOW,
    tags: [["h", channelId]],
    content: "hi",
    sig: "sig".padEnd(128, "0"),
  });

  assert.deepEqual(
    [...channelsWithActivity([event("chan-1"), event("chan-3")])].sort(),
    ["chan-1", "chan-3"],
  );
});

test("an event with no channel tag is ignored", () => {
  const orphan = {
    id: "orphan",
    pubkey: "aa".repeat(32),
    kind: 9,
    created_at: NOW,
    tags: [],
    content: "",
    sig: "sig".padEnd(128, "0"),
  };
  assert.equal(channelsWithActivity([orphan]).size, 0);
});

test("an empty response means nothing is unread", () => {
  assert.equal(channelsWithActivity([]).size, 0);
});
