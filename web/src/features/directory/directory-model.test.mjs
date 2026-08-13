import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDirectory,
  buildMemberListFilter,
  membersFromEvents,
  searchDirectory,
} from "@/features/directory/directory-model";

const ME = "e".repeat(64);
const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const CAROL = "c".repeat(64);

const memberList = (channelId, members) => ({
  id: "m".repeat(64),
  pubkey: "r".repeat(64),
  kind: 39002,
  created_at: 1000,
  tags: [
    ["d", channelId],
    // NIP-29 convention: ["p", pubkey, relay_url, role].
    ...members.map(([pubkey, role]) => ["p", pubkey, "", role]),
  ],
  content: "",
  sig: "s".repeat(128),
});

const profile = (pubkey, displayName, name = null) => ({
  pubkey,
  displayName,
  name,
  about: null,
  avatarUrl: null,
  nip05: null,
  updatedAt: 0,
});

test("one filter covers every channel, keyed on the d tag", () => {
  const filter = buildMemberListFilter(["c-1", "c-2", "c-1"]);
  assert.deepEqual(filter.kinds, [39002]);
  assert.deepEqual(filter["#d"], ["c-1", "c-2"]);
});

test("no channels means no request", () => {
  assert.equal(buildMemberListFilter([]), null);
  assert.equal(buildMemberListFilter([""]), null);
});

test("members are read from the p tags", () => {
  const roles = membersFromEvents([
    memberList("c-1", [
      [ALICE, "owner"],
      [BOB, "member"],
    ]),
  ]);
  assert.equal(roles.get(ALICE), "owner");
  assert.equal(roles.get(BOB), "member");
});

test("a person in several channels keeps their strongest role", () => {
  // Listing them twice, or as a plain member because that list parsed last,
  // would both be worse than being slightly generous about seniority.
  const roles = membersFromEvents([
    memberList("c-1", [[ALICE, "member"]]),
    memberList("c-2", [[ALICE, "admin"]]),
  ]);
  assert.equal(roles.size, 1);
  assert.equal(roles.get(ALICE), "admin");
});

test("order of arrival does not decide the role", () => {
  const forward = membersFromEvents([
    memberList("c-1", [[ALICE, "owner"]]),
    memberList("c-2", [[ALICE, "member"]]),
  ]);
  assert.equal(forward.get(ALICE), "owner");
});

test("a p tag with no role is a member", () => {
  const roles = membersFromEvents([
    {
      ...memberList("c-1", []),
      tags: [
        ["d", "c-1"],
        ["p", ALICE],
      ],
    },
  ]);
  assert.equal(roles.get(ALICE), "member");
});

test("a non-member event contributes nothing", () => {
  const roles = membersFromEvents([
    { ...memberList("c-1", [[ALICE, "owner"]]), kind: 39000 },
  ]);
  assert.equal(roles.size, 0);
});

test("pubkeys are normalized", () => {
  const roles = membersFromEvents([
    memberList("c-1", [[ALICE.toUpperCase(), "member"]]),
  ]);
  assert.ok(roles.has(ALICE));
});

test("the reader is not a candidate to address", () => {
  const entries = buildDirectory({
    excludePubkey: ME,
    profiles: {},
    roles: new Map([
      [ME, "owner"],
      [ALICE, "member"],
    ]),
  });
  assert.deepEqual(
    entries.map((entry) => entry.pubkey),
    [ALICE],
  );
});

test("entries carry a resolved name, never You", () => {
  const entries = buildDirectory({
    excludePubkey: null,
    profiles: { [ALICE]: profile(ALICE, "Alice A", "alice") },
    roles: new Map([[ALICE, "admin"]]),
  });
  assert.deepEqual(entries[0], {
    pubkey: ALICE,
    label: "Alice A",
    handle: "alice",
    role: "admin",
  });
});

test("someone with no profile is still addressable", () => {
  const entries = buildDirectory({
    profiles: {},
    roles: new Map([[ALICE, "member"]]),
  });
  // A membership id, not a truncated key — see §7.
  assert.match(entries[0].label, /^mem_/);
  assert.ok(!entries[0].label.includes("aaaa"));
  assert.equal(entries[0].handle, null);
});

test("entries are sorted by name", () => {
  const entries = buildDirectory({
    profiles: {
      [ALICE]: profile(ALICE, "Zoe"),
      [BOB]: profile(BOB, "Adam"),
    },
    roles: new Map([
      [ALICE, "member"],
      [BOB, "member"],
    ]),
  });
  assert.deepEqual(
    entries.map((entry) => entry.label),
    ["Adam", "Zoe"],
  );
});

const DIRECTORY = [
  { pubkey: ALICE, label: "Kenji Sato", handle: "kenji", role: "member" },
  { pubkey: BOB, label: "Aya Suzuki", handle: "aya", role: "member" },
  {
    pubkey: CAROL,
    label: "Misaki Tanaka",
    handle: "ken-support",
    role: "member",
  },
];

test("an empty query browses everyone", () => {
  assert.equal(searchDirectory(DIRECTORY, "").length, 3);
  assert.equal(searchDirectory(DIRECTORY, "  ").length, 3);
});

test("a name prefix outranks a handle that merely contains the query", () => {
  const hits = searchDirectory(DIRECTORY, "ken");
  assert.deepEqual(
    hits.map((entry) => entry.label),
    ["Kenji Sato", "Misaki Tanaka"],
  );
});

test("a handle prefix matches", () => {
  const hits = searchDirectory(DIRECTORY, "aya");
  assert.deepEqual(
    hits.map((entry) => entry.label),
    ["Aya Suzuki"],
  );
});

test("matching is case-insensitive", () => {
  assert.equal(searchDirectory(DIRECTORY, "KENJI")[0].pubkey, ALICE);
});

test("a pubkey matches by prefix only", () => {
  // A substring match against 64 hex characters pairs arbitrary people with
  // arbitrary queries. Tested against a key whose characters differ, since any
  // substring of an all-`a` key is also a prefix of it.
  const mixed = "0123456789abcdef".repeat(4);
  const directory = [
    { pubkey: mixed, label: "Mixed Key", handle: null, role: "member" },
  ];
  assert.equal(searchDirectory(directory, "012345")[0].pubkey, mixed);
  assert.deepEqual(searchDirectory(directory, "456789"), []);
});

test("nothing matching returns nothing", () => {
  assert.deepEqual(searchDirectory(DIRECTORY, "zzzz"), []);
});

test("the result set is capped", () => {
  const many = Array.from({ length: 30 }, (_, index) => ({
    pubkey: index.toString(16).padStart(64, "0"),
    label: `Person ${index}`,
    handle: null,
    role: "member",
  }));
  assert.equal(searchDirectory(many, "Person", 5).length, 5);
});
