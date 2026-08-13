import type {
  CommunityMember,
  MemberRole,
  ShowcaseAgent,
} from "@/mock/showcase";

/**
 * Who is in a channel.
 *
 * The desktop client's channel view had a roster pane; this one only had the
 * membership list buried in Settings, which answers "who is in the community"
 * and not the question a reader actually has while looking at a room: who is
 * here, who can act, and who is an agent rather than a person.
 *
 * Agents are a separate list rather than more rows in one: an agent is assigned
 * to specific channels and a person is not, so mixing them would imply the
 * people were assigned too — and the operator's next action on an agent (pause,
 * open its run) is nothing like their next action on a person.
 */

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
};

const ROLE_RANK: Record<MemberRole, number> = { owner: 0, admin: 1, member: 2 };

/** A person in the roster, with whatever is known about their current state. */
export interface RosterPerson {
  pubkey: string;
  role: MemberRole;
  /** Milliseconds, or `null` when they are not under a timeout. */
  timeoutUntilMs: number | null;
}

export interface ChannelRoster {
  people: RosterPerson[];
  agents: ShowcaseAgent[];
}

/**
 * The roster for one channel.
 *
 * Membership is community-wide — the relay's NIP-29 model has no per-channel
 * member list — so every member is in every channel's roster, and the honest
 * rendering of that is to show them all rather than invent a subset. Agents are
 * the part that is genuinely per-channel: each one names the channels it is
 * assigned to.
 *
 * Ordered by role, then by pubkey. Role first because it is what the reader is
 * scanning for (who can act on a report, who to ask for an invite); pubkey second
 * only so the order is stable rather than dependent on fixture order — sorting by
 * display name would reorder rows as profiles resolve, which reads as the list
 * shuffling itself.
 */
export function channelRoster({
  agents,
  channelName,
  members,
}: {
  agents: ShowcaseAgent[];
  /** The channel's name without its `#`, as agents record their assignments. */
  channelName: string | null;
  members: CommunityMember[];
}): ChannelRoster {
  const people = [...members]
    .sort(
      (left, right) =>
        ROLE_RANK[left.role] - ROLE_RANK[right.role] ||
        left.pubkey.localeCompare(right.pubkey),
    )
    .map((member) => ({
      pubkey: member.pubkey,
      role: member.role,
      timeoutUntilMs:
        member.timeoutUntil === null ? null : member.timeoutUntil * 1000,
    }));

  const assigned =
    channelName === null
      ? []
      : agents.filter((agent) => agent.channels.includes(channelName));

  return { people, agents: assigned };
}

/**
 * The roster's headline count.
 *
 * People and agents are counted separately because they are not
 * interchangeable — "6人" for four people and two agents would overstate how
 * many humans are reachable in the room, which is what the number is for.
 */
export function rosterCounts(roster: ChannelRoster): string {
  const { agents, people } = roster;
  if (agents.length === 0) return `${people.length}人`;
  return `${people.length}人・エージェント${agents.length}`;
}

/**
 * Which side panel is open.
 *
 * One at a time, by construction rather than by two booleans that can both be
 * true: the timeline is the pane being read, and two 384px panels beside it on a
 * 1280px window leave it narrower than either. Opening one closes the other.
 */
export type ChannelPane =
  | { kind: "thread"; rootId: string }
  | { kind: "roster" }
  | { kind: "canvas" };

export function togglePane(
  current: ChannelPane | null,
  next: ChannelPane,
): ChannelPane | null {
  if (current === null) return next;
  if (current.kind !== next.kind) return next;
  // Same kind: the roster toggles shut, and so does a thread the reader is
  // already looking at. Asking for a *different* thread while one is open is a
  // switch, not a close — otherwise clicking a second thread would blank the pane.
  if (current.kind === "thread" && next.kind === "thread") {
    return current.rootId === next.rootId ? null : next;
  }
  return null;
}
