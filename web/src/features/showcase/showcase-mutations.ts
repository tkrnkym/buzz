/**
 * Fixture edits for the smaller mock-up screens.
 *
 * Forum, reminders, members, and the huddle bar. Each is a handful of functions,
 * so they share a file rather than each getting one — the Workflows, Agents, and
 * Projects screens have their own because their shapes are large enough that a
 * reader chasing one would otherwise scroll past the other two.
 */

import type {
  CommunityMember,
  ForumPost,
  HuddleParticipant,
  MemberRole,
  Reminder,
  Showcase,
} from "@/mock/showcase";

// --- Forum -----------------------------------------------------------------

export function addForumPost(
  current: Showcase,
  post: {
    id: string;
    title: string;
    body: string;
    channel: string;
    authorPubkey: string;
    at: number;
  },
): Showcase {
  const entry: ForumPost = {
    ...post,
    replyCount: 0,
    reactions: [],
    pinned: false,
    comments: [],
  };
  return { ...current, forum: [entry, ...current.forum] };
}

/**
 * Add a comment, and move the reply count with it.
 *
 * The count is stored rather than derived, which mirrors the relay — `reply_count`
 * is materialized on the thread root there too. So it has to be updated here or
 * the list row and the open thread disagree about how many replies there are.
 */
export function addForumComment(
  current: Showcase,
  postId: string,
  comment: { id: string; authorPubkey: string; body: string; at: number },
): Showcase {
  return {
    ...current,
    forum: current.forum.map((post) =>
      post.id === postId
        ? {
            ...post,
            comments: [...post.comments, comment],
            replyCount: post.replyCount + 1,
          }
        : post,
    ),
  };
}

export function removeForumPost(current: Showcase, postId: string): Showcase {
  return {
    ...current,
    forum: current.forum.filter((post) => post.id !== postId),
  };
}

export function setForumPinned(
  current: Showcase,
  postId: string,
  pinned: boolean,
): Showcase {
  return {
    ...current,
    forum: current.forum.map((post) =>
      post.id === postId ? { ...post, pinned } : post,
    ),
  };
}

// --- Reminders -------------------------------------------------------------

/**
 * Push a reminder further out.
 *
 * Measured from now rather than from its current due time. Someone snoozing an
 * overdue reminder by an hour means "an hour from now" — adding an hour to a time
 * that has already passed would leave it still overdue, which is the bug that
 * makes a snooze button feel broken.
 */
export function snoozeReminder(
  current: Showcase,
  id: string,
  seconds: number,
  nowSeconds: number,
): Showcase {
  return {
    ...current,
    reminders: current.reminders.map((reminder) =>
      reminder.id === id
        ? { ...reminder, dueAt: nowSeconds + seconds, done: false }
        : reminder,
    ),
  };
}

export function setReminderDone(
  current: Showcase,
  id: string,
  done: boolean,
): Showcase {
  return {
    ...current,
    reminders: current.reminders.map((reminder) =>
      reminder.id === id ? { ...reminder, done } : reminder,
    ),
  };
}

export function addReminder(current: Showcase, reminder: Reminder): Showcase {
  return { ...current, reminders: [...current.reminders, reminder] };
}

export function removeReminder(current: Showcase, id: string): Showcase {
  return {
    ...current,
    reminders: current.reminders.filter((reminder) => reminder.id !== id),
  };
}

// --- Members ---------------------------------------------------------------

export function addMember(
  current: Showcase,
  member: CommunityMember,
): Showcase {
  // Ignored when already present: adding someone twice is a mis-click, not a
  // request for two rows.
  if (current.members.some((row) => row.pubkey === member.pubkey))
    return current;
  return { ...current, members: [...current.members, member] };
}

export function removeMember(current: Showcase, pubkey: string): Showcase {
  return {
    ...current,
    members: current.members.filter((row) => row.pubkey !== pubkey),
  };
}

/**
 * Change someone's role.
 *
 * Demoting the last owner is refused. A community with no owner has nobody who
 * can promote one, which is a state the UI must not be able to produce even in a
 * demo — the same rule the relay enforces.
 */
export function setMemberRole(
  current: Showcase,
  pubkey: string,
  role: MemberRole,
): Showcase {
  const owners = current.members.filter((row) => row.role === "owner");
  const target = current.members.find((row) => row.pubkey === pubkey);
  if (target?.role === "owner" && role !== "owner" && owners.length === 1) {
    return current;
  }
  return {
    ...current,
    members: current.members.map((row) =>
      row.pubkey === pubkey ? { ...row, role } : row,
    ),
  };
}

/** Whether this role change would leave the community without an owner. */
export function wouldOrphanCommunity(
  members: CommunityMember[],
  pubkey: string,
  role: MemberRole,
): boolean {
  const owners = members.filter((row) => row.role === "owner");
  const target = members.find((row) => row.pubkey === pubkey);
  return target?.role === "owner" && role !== "owner" && owners.length === 1;
}

// --- Huddle ----------------------------------------------------------------

export function addHuddleParticipant(
  current: Showcase,
  participant: HuddleParticipant,
): Showcase {
  if (
    current.huddle.participants.some((row) => row.pubkey === participant.pubkey)
  ) {
    return current;
  }
  return {
    ...current,
    huddle: {
      ...current.huddle,
      participants: [...current.huddle.participants, participant],
    },
  };
}

export function removeHuddleParticipant(
  current: Showcase,
  pubkey: string,
): Showcase {
  return {
    ...current,
    huddle: {
      ...current.huddle,
      participants: current.huddle.participants.filter(
        (row) => row.pubkey !== pubkey,
      ),
    },
  };
}

/**
 * Mute or unmute someone in the huddle.
 *
 * Muting also stops them speaking, because the speaking ring and the mute badge
 * would otherwise contradict each other on the same avatar.
 */
export function setHuddleMuted(
  current: Showcase,
  pubkey: string,
  muted: boolean,
): Showcase {
  return {
    ...current,
    huddle: {
      ...current.huddle,
      participants: current.huddle.participants.map((row) =>
        row.pubkey === pubkey
          ? { ...row, muted, speaking: muted ? false : row.speaking }
          : row,
      ),
    },
  };
}

// --- Pulse -----------------------------------------------------------------

/**
 * Add or withdraw a reaction on a pulse entry.
 *
 * Withdrawing removes the chip entirely at zero rather than leaving a `0` behind:
 * a reaction nobody holds is not a reaction, and a row of zeroed chips is how the
 * count stops meaning anything.
 *
 * There is no per-reader record of who reacted in this fixture shape, so a second
 * click on the same emoji withdraws — which is what a single reader in a demo
 * expects, and what the real timeline does through `myReactionId`.
 */
export function togglePulseReaction(
  current: Showcase,
  entryId: string,
  emoji: string,
): Showcase {
  return {
    ...current,
    pulse: current.pulse.map((entry) => {
      if (entry.id !== entryId) return entry;
      const existing = entry.reactions.find((row) => row.emoji === emoji);
      if (!existing) {
        return {
          ...entry,
          reactions: [...entry.reactions, { emoji, count: 1 }],
        };
      }
      if (existing.count <= 1) {
        return {
          ...entry,
          reactions: entry.reactions.filter((row) => row.emoji !== emoji),
        };
      }
      return {
        ...entry,
        reactions: entry.reactions.map((row) =>
          row.emoji === emoji ? { ...row, count: row.count - 1 } : row,
        ),
      };
    }),
  };
}
