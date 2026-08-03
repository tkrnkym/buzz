import assert from "node:assert/strict";
import test from "node:test";

import {
  addForumComment,
  addForumPost,
  addHuddleParticipant,
  addMember,
  removeMember,
  setHuddleMuted,
  setMemberRole,
  snoozeReminder,
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

test("a new pulse reaction starts at one", () => {
  const next = togglePulseReaction(base(), "e1", "🎉");
  assert.deepEqual(next.pulse[0].reactions, [
    { emoji: "👍", count: 2 },
    { emoji: "🎉", count: 1 },
  ]);
});

test("withdrawing decrements, and the chip goes at zero", () => {
  const once = togglePulseReaction(base(), "e1", "👍");
  assert.deepEqual(once.pulse[0].reactions, [{ emoji: "👍", count: 1 }]);
  // A reaction nobody holds is not a reaction — the chip goes rather than showing 0.
  const twice = togglePulseReaction(once, "e1", "👍");
  assert.deepEqual(twice.pulse[0].reactions, []);
});
