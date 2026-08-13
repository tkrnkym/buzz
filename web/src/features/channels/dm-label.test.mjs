import assert from "node:assert/strict";
import test from "node:test";

import {
  dmCounterparts,
  joinNames,
  resolveChannelLabel,
} from "@/features/channels/dm-label";

const ME = "e".repeat(64);
const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

const channel = (overrides = {}) => ({
  id: "c-1",
  name: "dm",
  about: null,
  topic: null,
  type: "dm",
  isPrivate: true,
  hidden: true,
  archived: false,
  participantPubkeys: [ME, ALICE],
  updatedAt: 0,
  ...overrides,
});

const profiles = {
  [ALICE]: {
    pubkey: ALICE,
    displayName: "Alice",
    name: null,
    about: null,
    avatarUrl: null,
    nip05: null,
    updatedAt: 0,
  },
  [BOB]: {
    pubkey: BOB,
    displayName: "Bob",
    name: null,
    about: null,
    avatarUrl: null,
    nip05: null,
    updatedAt: 0,
  },
  [ME]: {
    pubkey: ME,
    displayName: "Me",
    name: null,
    about: null,
    avatarUrl: null,
    nip05: null,
    updatedAt: 0,
  },
};

test("prose joins read naturally at every length", () => {
  assert.equal(joinNames([]), "");
  assert.equal(joinNames(["a"]), "a");
  assert.equal(joinNames(["a", "b"]), "a and b");
  assert.equal(joinNames(["a", "b", "c"]), "a, b and c");
});

test("a DM is labelled by the person who is not the reader", () => {
  assert.equal(
    resolveChannelLabel({ channel: channel(), currentPubkey: ME, profiles }),
    "Alice",
  );
});

test("a group DM names everyone else", () => {
  assert.equal(
    resolveChannelLabel({
      channel: channel({ participantPubkeys: [ME, ALICE, BOB] }),
      currentPubkey: ME,
      profiles,
    }),
    "Alice and Bob",
  );
});

test("a note-to-self DM is titled with the reader's own name", () => {
  // "You" reads as a bug in a list of conversations.
  assert.equal(
    resolveChannelLabel({
      channel: channel({ participantPubkeys: [ME] }),
      currentPubkey: ME,
      profiles,
    }),
    "Me",
  );
});

test("an unresolved participant falls back to their membership id", () => {
  // Not a truncated key. §7 makes the membership id what the product names
  // people by, and this is the path a DM takes before profiles resolve.
  const label = resolveChannelLabel({ channel: channel(), currentPubkey: ME });
  assert.match(label, /^mem_/);
  assert.ok(!label.includes("aaaa"), "the key must not leak into the label");
});

test("every generic name the relay uses is replaced", () => {
  for (const name of [
    "",
    "dm",
    "DM",
    "Direct Message",
    "direct messages",
    "Group DM",
    "Group DM (3)",
  ]) {
    assert.equal(
      resolveChannelLabel({
        channel: channel({ name }),
        currentPubkey: ME,
        profiles,
      }),
      "Alice",
      `"${name}" should be replaced`,
    );
  }
});

test("a deliberately named DM keeps its name", () => {
  // Named by a person, or by a future relay feature — not ours to overwrite.
  assert.equal(
    resolveChannelLabel({
      channel: channel({ name: "Launch war room" }),
      currentPubkey: ME,
      profiles,
    }),
    "Launch war room",
  );
});

test("a channel that is not a DM is always its own name", () => {
  assert.equal(
    resolveChannelLabel({
      channel: channel({ type: "stream", name: "general" }),
      currentPubkey: ME,
      profiles,
    }),
    "general",
  );
});

test("duplicate participants do not produce a repeated name", () => {
  assert.equal(
    resolveChannelLabel({
      channel: channel({ participantPubkeys: [ME, ALICE, ALICE] }),
      currentPubkey: ME,
      profiles,
    }),
    "Alice",
  );
});

test("counterparts exclude the reader, or fall back to everyone", () => {
  assert.deepEqual(dmCounterparts(channel(), ME), [ALICE]);
  assert.deepEqual(dmCounterparts(channel({ participantPubkeys: [ME] }), ME), [
    ME,
  ]);
  // With no reader identity yet, nobody can be excluded.
  assert.deepEqual(dmCounterparts(channel(), null), [ME, ALICE]);
});
