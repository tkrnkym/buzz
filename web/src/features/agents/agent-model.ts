/**
 * Presentation rules for agents.
 *
 * Separated from the screen so the parts worth being sure about — what counts
 * as working, how a status reads, how idleness is phrased — are testable
 * without a DOM. They are also the parts a relay-backed version keeps
 * unchanged.
 */

import type { AgentStatus, ShowcaseAgent } from "@/mock/showcase";

/** Human label for a status, as the desktop client worded them. */
export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  working: "実行中",
  idle: "待機中",
  paused: "停止中",
  error: "エラー",
};

/**
 * Tailwind classes for a status dot.
 *
 * Error is destructive rather than merely grey: an agent that has stopped
 * failing to start is the one state a reader has to act on, and it looking the
 * same as "idle" is how it goes unnoticed for a day.
 */
export const AGENT_STATUS_DOT: Record<AgentStatus, string> = {
  working: "bg-primary",
  idle: "bg-muted-foreground/50",
  paused: "bg-muted-foreground/30",
  error: "bg-destructive",
};

/** Ordering for the list: things needing attention first, then by recency. */
const STATUS_RANK: Record<AgentStatus, number> = {
  error: 0,
  working: 1,
  idle: 2,
  paused: 3,
};

export function sortAgents(agents: ShowcaseAgent[]): ShowcaseAgent[] {
  return [...agents].sort(
    (left, right) =>
      STATUS_RANK[left.status] - STATUS_RANK[right.status] ||
      right.lastActiveAt - left.lastActiveAt ||
      left.name.localeCompare(right.name),
  );
}

/**
 * "3分前" and friends.
 *
 * Coarse on purpose past an hour: an agent last seen at 14:32 versus 14:36 is
 * the same fact to a reader deciding whether it is stuck.
 */
export function formatRelativeTime(
  atSeconds: number,
  nowSeconds: number,
): string {
  const seconds = Math.max(0, nowSeconds - atSeconds);
  if (seconds < 60) return "たった今";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

/** Agents grouped by the channel they were added to, channel name ascending. */
export function groupAgentsByChannel(
  agents: ShowcaseAgent[],
): { channel: string; agents: ShowcaseAgent[] }[] {
  const byChannel = new Map<string, ShowcaseAgent[]>();
  for (const agent of agents) {
    for (const channel of agent.channels) {
      const group = byChannel.get(channel) ?? [];
      group.push(agent);
      byChannel.set(channel, group);
    }
  }
  return [...byChannel]
    .map(([channel, group]) => ({ channel, agents: sortAgents(group) }))
    .sort((left, right) => left.channel.localeCompare(right.channel));
}

/** How many agents are doing something right now. */
export function workingCount(agents: ShowcaseAgent[]): number {
  return agents.filter((agent) => agent.status === "working").length;
}
