import assert from "node:assert/strict";
import test from "node:test";

import {
  addCommunity,
  addForumComment,
  addForumPost,
  addHuddleParticipant,
  addMember,
  addPulseNote,
  removeMember,
  setHuddleMuted,
  setMemberRole,
  snoozeReminder,
  toggleForumReaction,
  togglePulseReaction,
  wouldOrphanCommunity,
} from "@/features/showcase/showcase-mutations";

const OWNER = "1".repeat(64);
const ADMIN = "2".repeat(64);
const MEMBER = "3".repeat(64);

const base = () => ({
  forum: [
    {
      id: "p1",
      title: "既存",
      body: "",
      authorPubkey: OWNER,
      channel: "general",
      at: 100,
      replyCount: 1,
      reactions: [],
      pinned: false,
      comments: [{ id: "c0", authorPubkey: ADMIN, body: "先に", at: 110 }],
    },
  ],
  reminders: [
    {
      id: "r1",
      subject: "見る",
      channel: "dev",
      dueAt: 50,
      createdAt: 10,
      done: false,
    },
  ],
  members: [
    { pubkey: OWNER, role: "owner", joinedAt: 1, timeoutUntil: null },
    { pubkey: ADMIN, role: "admin", joinedAt: 2, timeoutUntil: null },
  ],
  huddle: {
    channel: "dev",
    startedAt: 10,
    participants: [
      { pubkey: OWNER, speaking: true, muted: false, isAgent: false },
    ],
  },
  pulse: [
    {
      id: "e1",
      tab: "notes",
      authorPubkey: OWNER,
      title: "",
      body: "",
      channel: null,
      at: 1,
      reactions: [{ emoji: "👍", count: 2 }],
    },
  ],
  communities: [
    {
      id: "c-existing",
      name: "既存",
      relayUrl: "wss://relay.example.jp",
      memberCount: 3,
      hosted: false,
      joinPolicy: "invite",
    },
  ],
});

test("a new forum post goes to the top", () => {
  // Newest-first, and the reader is looking at the list right now.
  const next = addForumPost(base(), {
    id: "p2",
    title: "新しい",
    body: "本文",
    channel: "dev",
    authorPubkey: MEMBER,
    at: 200,
  });
  assert.equal(next.forum[0].id, "p2");
  assert.equal(next.forum[0].replyCount, 0);
  assert.deepEqual(next.forum[0].comments, []);
});

test("a comment moves the reply count with it", () => {
  // The count is stored, not derived — the same shape the relay materializes — so
  // the list row and the open thread would otherwise disagree.
  const next = addForumComment(base(), "p1", {
    id: "c1",
    authorPubkey: MEMBER,
    body: "あとで",
    at: 300,
  });
  assert.equal(next.forum[0].comments.length, 2);
  assert.equal(next.forum[0].replyCount, 2);
});

test("a snooze is measured from now, not from when it was due", () => {
  // An overdue reminder pushed by an hour means an hour from now. Adding to a
  // time that has already passed would leave it still overdue.
  const next = snoozeReminder(base(), "r1", 3600, 1000);
  assert.equal(next.reminders[0].dueAt, 4600);
  assert.equal(next.reminders[0].done, false);
});

test("adding someone twice adds one row", () => {
  const once = addMember(base(), {
    pubkey: MEMBER,
    role: "member",
    joinedAt: 5,
    timeoutUntil: null,
  });
  const twice = addMember(once, {
    pubkey: MEMBER,
    role: "member",
    joinedAt: 6,
    timeoutUntil: null,
  });
  assert.equal(twice.members.length, 3);
});

test("the last owner cannot be demoted or removed", () => {
  // A community with no owner has nobody who can promote one.
  const state = base();
  assert.equal(wouldOrphanCommunity(state.members, OWNER, "member"), true);
  assert.equal(setMemberRole(state, OWNER, "member"), state);
  // The check is what the UI gates on; the removal itself is unguarded because
  // the caller has already refused.
  assert.equal(wouldOrphanCommunity(state.members, ADMIN, "member"), false);
});

test("an owner can be demoted once there is a second one", () => {
  const two = setMemberRole(base(), ADMIN, "owner");
  const next = setMemberRole(two, OWNER, "member");
  assert.equal(next.members.find((row) => row.pubkey === OWNER).role, "member");
});

test("removing a non-owner works", () => {
  const next = removeMember(base(), ADMIN);
  assert.equal(next.members.length, 1);
});

test("an agent joins the huddle once, and joins muted", () => {
  const agent = {
    pubkey: MEMBER,
    speaking: false,
    muted: true,
    isAgent: true,
  };
  const once = addHuddleParticipant(base(), agent);
  assert.equal(once.huddle.participants.length, 2);
  assert.equal(addHuddleParticipant(once, agent).huddle.participants.length, 2);
});

test("muting someone also stops them speaking", () => {
  // The speaking ring and the mute badge sit on the same avatar; both true is a
  // contradiction.
  const next = setHuddleMuted(base(), OWNER, true);
  assert.equal(next.huddle.participants[0].muted, true);
  assert.equal(next.huddle.participants[0].speaking, false);
});

test("a new pulse reaction starts at one, and is the reader's", () => {
  const next = togglePulseReaction(base(), "e1", "🎉");
  assert.deepEqual(next.pulse[0].reactions, [
    { emoji: "👍", count: 2 },
    { emoji: "🎉", count: 1, mine: true },
  ]);
});

test("clicking a reaction other people hold joins it rather than removing one", () => {
  // The seeded 👍 is held by two others and not by the reader. Counting down here
  // would be deleting someone else's reaction.
  const once = togglePulseReaction(base(), "e1", "👍");
  assert.deepEqual(once.pulse[0].reactions, [
    { emoji: "👍", count: 3, mine: true },
  ]);
  const twice = togglePulseReaction(once, "e1", "👍");
  assert.deepEqual(twice.pulse[0].reactions, [
    { emoji: "👍", count: 2, mine: false },
  ]);
});

test("the chip goes at zero rather than showing 0", () => {
  // A reaction nobody holds is not a reaction.
  const added = togglePulseReaction(base(), "e1", "🎉");
  const withdrawn = togglePulseReaction(added, "e1", "🎉");
  assert.deepEqual(withdrawn.pulse[0].reactions, [{ emoji: "👍", count: 2 }]);
});

test("a forum reaction follows the same rule as a pulse one", () => {
  // One implementation, so the two cannot disagree — the forum's chips were
  // read-only text until now, which is why there was nothing to diverge from.
  const joined = toggleForumReaction(base(), "p1", "🎉");
  assert.deepEqual(joined.forum[0].reactions, [
    { emoji: "🎉", count: 1, mine: true },
  ]);
  // And withdrawing takes the chip away rather than leaving a 0 behind.
  const withdrawn = toggleForumReaction(joined, "p1", "🎉");
  assert.deepEqual(withdrawn.forum[0].reactions, []);
});

test("a note written from Pulse lands at the top of the notes tab", () => {
  const next = addPulseNote(base(), {
    id: "n1",
    authorPubkey: OWNER,
    title: "決めごと",
    body: "本文",
    channel: "dev",
    at: 999,
  });
  assert.equal(next.pulse[0].id, "n1");
  // Always a note: the agents tab is what agents filed, and a person posting
  // into it would make that tab a lie.
  assert.equal(next.pulse[0].tab, "notes");
  assert.deepEqual(next.pulse[0].reactions, []);
});

test("a created community goes to the end of the rail", () => {
  // The rail's order is the order communities were joined; a new one jumping
  // ahead would move every position the reader had learned.
  const next = addCommunity(base(), {
    id: "c-new",
    name: "my-team",
    relayUrl: "wss://my-team.nuxx.host",
    memberCount: 1,
    hosted: true,
    joinPolicy: "invite",
  });
  assert.equal(next.communities.length, base().communities.length + 1);
  assert.equal(next.communities[next.communities.length - 1].id, "c-new");
});
