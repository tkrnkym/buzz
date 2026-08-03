import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DM_PARTICIPANTS,
  buildCreateChannelTemplate,
  buildDmOpenTemplate,
  buildJoinChannelTemplate,
  buildLeaveChannelTemplate,
  canonicalChannelName,
} from "@/features/channels/channel-ops";

const CHANNEL_ID = "11111111-1111-4111-8111-111111111111";
const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

test("only a leading # and surrounding whitespace are stripped", () => {
  // Exactly what `nuxx_core::channel::canonical_channel_name` does. The relay
  // does not lowercase or hyphenate, so a preview that did would show the reader
  // a name that is not the one about to exist.
  assert.equal(canonicalChannelName("#general"), "general");
  assert.equal(canonicalChannelName("  #general  "), "general");
  assert.equal(canonicalChannelName("Design Review"), "Design Review");
  assert.equal(canonicalChannelName("release-2.0"), "release-2.0");
  assert.equal(canonicalChannelName("設計レビュー"), "設計レビュー");
});

test("a name of nothing but a hash and spaces is empty", () => {
  assert.equal(canonicalChannelName("#  "), "");
  assert.equal(canonicalChannelName("   "), "");
});

test("interior whitespace is preserved", () => {
  // The relay keeps it, so the dialog must not promise otherwise.
  assert.equal(canonicalChannelName("ship   it"), "ship   it");
});

test("creating a channel carries the id, the canonical name, and the options", () => {
  const template = buildCreateChannelTemplate({
    channelId: CHANNEL_ID,
    name: "Design Review",
    visibility: "private",
    channelType: "forum",
    about: "  weekly  ",
    ttlSeconds: 3600,
  });
  assert.equal(template.kind, 9007);
  assert.equal(template.content, "");
  assert.deepEqual(template.tags, [
    ["h", CHANNEL_ID],
    ["name", "Design Review"],
    ["visibility", "private"],
    ["channel_type", "forum"],
    ["about", "weekly"],
    ["ttl", "3600"],
  ]);
});

test("omitted options are absent rather than defaulted client-side", () => {
  // The relay owns the defaults. Writing them here would freeze today's values
  // into every event this client ever publishes.
  const template = buildCreateChannelTemplate({
    channelId: CHANNEL_ID,
    name: "general",
  });
  assert.deepEqual(template.tags, [
    ["h", CHANNEL_ID],
    ["name", "general"],
  ]);
});

test("a blank about is not written as an empty tag", () => {
  const template = buildCreateChannelTemplate({
    channelId: CHANNEL_ID,
    name: "general",
    about: "   ",
  });
  assert.ok(template.tags.every((tag) => tag[0] !== "about"));
});

test("a name with nothing usable in it is refused", () => {
  assert.throws(
    () => buildCreateChannelTemplate({ channelId: CHANNEL_ID, name: "#  " }),
    /needs a name/,
  );
});

test("join and leave are channel-scoped and carry nothing else", () => {
  assert.deepEqual(buildJoinChannelTemplate(CHANNEL_ID), {
    kind: 9021,
    tags: [["h", CHANNEL_ID]],
    content: "",
  });
  assert.deepEqual(buildLeaveChannelTemplate(CHANNEL_ID), {
    kind: 9022,
    tags: [["h", CHANNEL_ID]],
    content: "",
  });
});

test("opening a DM names its participants and no channel", () => {
  // No `h` tag: the relay allocates the channel, so this client never derives an
  // id for a set of people.
  const template = buildDmOpenTemplate([BOB]);
  assert.equal(template.kind, 41010);
  assert.deepEqual(template.tags, [["p", BOB]]);
  assert.ok(template.tags.every((tag) => tag[0] !== "h"));
});

test("DM participants are normalized and deduplicated", () => {
  const template = buildDmOpenTemplate([
    ALICE.toUpperCase(),
    ` ${ALICE} `,
    BOB,
  ]);
  assert.deepEqual(template.tags, [
    ["p", ALICE],
    ["p", BOB],
  ]);
});

test("a DM with nobody in it is refused", () => {
  assert.throws(() => buildDmOpenTemplate([]), /at least one recipient/);
  assert.throws(() => buildDmOpenTemplate(["   "]), /at least one recipient/);
});

test("a DM beyond the relay's participant cap is refused here", () => {
  // Refused client-side so the reader is told, rather than watching a publish
  // fail with a relay error they cannot act on.
  const many = Array.from({ length: MAX_DM_PARTICIPANTS + 1 }, (_, index) =>
    index.toString(16).padStart(64, "0"),
  );
  assert.throws(() => buildDmOpenTemplate(many), /at most 8 people/);
});

test("something that is not a public key is refused", () => {
  assert.throws(() => buildDmOpenTemplate(["alice"]), /Not a public key/);
  assert.throws(
    () => buildDmOpenTemplate([ALICE.slice(0, 60)]),
    /Not a public key/,
  );
  // Uppercase is fine — it is normalized — but non-hex is not.
  assert.throws(
    () => buildDmOpenTemplate(["z".repeat(64)]),
    /Not a public key/,
  );
});
