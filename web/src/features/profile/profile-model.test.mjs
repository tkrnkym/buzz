import assert from "node:assert/strict";
import test from "node:test";

import {
  PROFILE_BATCH_SIZE,
  buildProfileFilters,
  buildProfileTemplate,
  eventToProfile,
  normalizePubkey,
  resolveAvatarUrl,
  resolveUserLabel,
  resolveUserSecondaryLabel,
  toProfileLookup,
} from "@/features/profile/profile-model";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

const profileEvent = (
  pubkey,
  content,
  createdAt = 1000,
  id = "i".repeat(64),
) => ({
  id,
  pubkey,
  kind: 0,
  created_at: createdAt,
  tags: [],
  content: typeof content === "string" ? content : JSON.stringify(content),
  sig: "s".repeat(128),
});

test("a kind:0 event maps to its fields", () => {
  const profile = eventToProfile(
    profileEvent(ALICE, {
      display_name: "Alice",
      name: "alice",
      about: "builds things",
      picture: "https://example.com/a.png",
      nip05: "alice@example.com",
    }),
  );
  assert.equal(profile.displayName, "Alice");
  assert.equal(profile.name, "alice");
  assert.equal(profile.about, "builds things");
  assert.equal(profile.avatarUrl, "https://example.com/a.png");
  assert.equal(profile.nip05, "alice@example.com");
  assert.equal(profile.pubkey, ALICE);
});

test("whitespace-only fields are absent, not empty strings", () => {
  // An empty display name must fall through to the next label, not render a
  // nameless person.
  const profile = eventToProfile(
    profileEvent(ALICE, { display_name: "   ", name: "" }),
  );
  assert.equal(profile.displayName, null);
  assert.equal(profile.name, null);
});

test("non-string fields are ignored rather than coerced", () => {
  const profile = eventToProfile(
    profileEvent(ALICE, { display_name: 42, picture: { url: "x" } }),
  );
  assert.equal(profile.displayName, null);
  assert.equal(profile.avatarUrl, null);
});

test("content that is not a JSON object yields no profile", () => {
  // Absent beats a row of empty fields: callers fall back to the pubkey.
  assert.equal(eventToProfile(profileEvent(ALICE, "not json")), null);
  assert.equal(eventToProfile(profileEvent(ALICE, "[1,2]")), null);
  assert.equal(eventToProfile(profileEvent(ALICE, "null")), null);
});

test("a non-profile kind is rejected", () => {
  assert.equal(
    eventToProfile({ ...profileEvent(ALICE, { name: "x" }), kind: 1 }),
    null,
  );
});

test("the newest profile per author wins", () => {
  // kind:0 is replaceable, but a relay can still hand back an older copy on
  // reconnect; a stale name must not win.
  const lookup = toProfileLookup([
    profileEvent(ALICE, { display_name: "Old" }, 1000),
    profileEvent(ALICE, { display_name: "New" }, 2000),
  ]);
  assert.equal(lookup[ALICE].displayName, "New");
});

test("delivery order does not decide the winner", () => {
  const newestFirst = toProfileLookup([
    profileEvent(ALICE, { display_name: "New" }, 2000),
    profileEvent(ALICE, { display_name: "Old" }, 1000),
  ]);
  assert.equal(newestFirst[ALICE].displayName, "New");
});

test("a same-second tie breaks on the id, so it is stable", () => {
  const forward = toProfileLookup([
    profileEvent(ALICE, { display_name: "aa" }, 1000, "aa".repeat(32)),
    profileEvent(ALICE, { display_name: "zz" }, 1000, "zz".repeat(32)),
  ]);
  const reversed = toProfileLookup([
    profileEvent(ALICE, { display_name: "zz" }, 1000, "zz".repeat(32)),
    profileEvent(ALICE, { display_name: "aa" }, 1000, "aa".repeat(32)),
  ]);
  assert.equal(forward[ALICE].displayName, reversed[ALICE].displayName);
});

test("profiles are keyed by lowercase pubkey", () => {
  const lookup = toProfileLookup([
    profileEvent(ALICE.toUpperCase(), { display_name: "Alice" }),
  ]);
  assert.equal(lookup[ALICE].displayName, "Alice");
  assert.equal(normalizePubkey(` ${ALICE.toUpperCase()} `), ALICE);
});

test("filters name their kind, which the relay's p-gate requires", () => {
  const [filter] = buildProfileFilters([ALICE]);
  assert.deepEqual(filter.kinds, [0]);
  assert.deepEqual(filter.authors, [ALICE]);
});

test("authors are chunked so one filter never names thousands", () => {
  const many = Array.from({ length: PROFILE_BATCH_SIZE * 2 + 1 }, (_, index) =>
    index.toString(16).padStart(64, "0"),
  );
  const filters = buildProfileFilters(many);
  assert.equal(filters.length, 3);
  assert.equal(filters[0].authors.length, PROFILE_BATCH_SIZE);
  assert.equal(filters[2].authors.length, 1);
});

test("duplicate and blank pubkeys are collapsed", () => {
  const filters = buildProfileFilters([ALICE, ALICE, "", "  "]);
  assert.equal(filters.length, 1);
  assert.deepEqual(filters[0].authors, [ALICE]);
});

test("no pubkeys means no request at all", () => {
  assert.deepEqual(buildProfileFilters([]), []);
});

test("label precedence: display name, name, nip05, fallback, pubkey", () => {
  const profiles = toProfileLookup([
    profileEvent(ALICE, {
      display_name: "Alice A",
      name: "alice",
      nip05: "alice@example.com",
    }),
  ]);
  assert.equal(resolveUserLabel({ pubkey: ALICE, profiles }), "Alice A");

  const nameOnly = toProfileLookup([
    profileEvent(ALICE, { name: "alice", nip05: "alice@example.com" }),
  ]);
  assert.equal(
    resolveUserLabel({ pubkey: ALICE, profiles: nameOnly }),
    "alice",
  );

  const nip05Only = toProfileLookup([
    profileEvent(ALICE, { nip05: "alice@example.com" }),
  ]);
  assert.equal(
    resolveUserLabel({ pubkey: ALICE, profiles: nip05Only }),
    "alice@example.com",
  );

  assert.equal(
    resolveUserLabel({ pubkey: ALICE, fallbackName: "from the channel" }),
    "from the channel",
  );
  assert.equal(resolveUserLabel({ pubkey: ALICE }), "aaaaaaaa…aaaa");
});

test("the reader is You", () => {
  assert.equal(
    resolveUserLabel({ pubkey: ALICE, currentPubkey: ALICE }),
    "You",
  );
  // Case difference is still the same person.
  assert.equal(
    resolveUserLabel({ pubkey: ALICE.toUpperCase(), currentPubkey: ALICE }),
    "You",
  );
});

test("a card about yourself can ask for the real name", () => {
  const profiles = toProfileLookup([
    profileEvent(ALICE, { display_name: "Alice A" }),
  ]);
  assert.equal(
    resolveUserLabel({
      pubkey: ALICE,
      currentPubkey: ALICE,
      preferResolvedSelfLabel: true,
      profiles,
    }),
    "Alice A",
  );
});

test("the secondary line does not repeat the primary one", () => {
  const withName = toProfileLookup([
    profileEvent(ALICE, { display_name: "Alice", nip05: "alice@example.com" }),
  ]);
  assert.equal(
    resolveUserSecondaryLabel({ pubkey: ALICE, profiles: withName }),
    "alice@example.com",
  );

  // The handle is already the primary label, so there is nothing to add.
  const handleOnly = toProfileLookup([
    profileEvent(ALICE, { nip05: "alice@example.com" }),
  ]);
  assert.equal(
    resolveUserSecondaryLabel({ pubkey: ALICE, profiles: handleOnly }),
    null,
  );
  assert.equal(resolveUserSecondaryLabel({ pubkey: BOB }), null);
});

test("an avatar is looked up case-insensitively, or absent", () => {
  const profiles = toProfileLookup([
    profileEvent(ALICE, { picture: "https://example.com/a.png" }),
  ]);
  assert.equal(
    resolveAvatarUrl(ALICE.toUpperCase(), profiles),
    "https://example.com/a.png",
  );
  assert.equal(resolveAvatarUrl(BOB, profiles), null);
});

test("publishing writes only the fields that have values", () => {
  const template = buildProfileTemplate({
    displayName: "Alice",
    name: "  ",
    about: null,
    avatarUrl: "https://example.com/a.png",
  });
  assert.equal(template.kind, 0);
  assert.deepEqual(template.tags, []);
  assert.deepEqual(JSON.parse(template.content), {
    display_name: "Alice",
    picture: "https://example.com/a.png",
  });
});

test("an all-empty profile publishes an empty object, which clears it", () => {
  // kind:0 is replaceable, so the published object *is* the whole profile.
  const template = buildProfileTemplate({ displayName: "", about: "   " });
  assert.equal(template.content, "{}");
});
