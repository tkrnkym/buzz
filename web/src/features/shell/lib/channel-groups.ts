/**
 * Sidebar grouping and ordering, ported from the desktop client's
 * `channelSortPreference` / section bucketing.
 *
 * Pure on purpose: which room appears under which heading, and in what order,
 * is the sidebar's whole contract with the reader. Keeping it out of React
 * means the rules are testable without a DOM and stay stable while the
 * rendering around them changes.
 */

import type { Channel } from "@/features/chat/chat-model";

export type ChannelSortMode = "alpha" | "recent";

export const DEFAULT_SORT_MODE: ChannelSortMode = "alpha";

/** A rendered sidebar heading and the rooms under it. */
export interface ChannelGroup {
  key: "starred" | "channels" | "forums";
  title: string;
  channels: Channel[];
}

export function compareChannelsByName(left: Channel, right: Channel): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

/**
 * Order one group's rooms.
 *
 * `alpha` is by name, with the id as tie-breaker so the order never depends on
 * the arrival order of two identically-named rooms. `recent` is newest activity
 * first; rooms with no observed activity sink to the bottom **in alphabetical
 * order** rather than being scattered — a quiet channel should stay findable
 * instead of drifting every time the snapshot changes.
 */
export function sortChannels(
  channels: Channel[],
  mode: ChannelSortMode,
  lastActivityAt: (channelId: string) => number | null = () => null,
): Channel[] {
  if (mode === "alpha") {
    return [...channels].sort(compareChannelsByName);
  }
  return [...channels].sort((left, right) => {
    const leftAt = lastActivityAt(left.id);
    const rightAt = lastActivityAt(right.id);
    if (leftAt !== null && rightAt !== null && leftAt !== rightAt) {
      return rightAt - leftAt;
    }
    if (leftAt !== null && rightAt === null) return -1;
    if (leftAt === null && rightAt !== null) return 1;
    return compareChannelsByName(left, right);
  });
}

/**
 * Split the channel list into the sidebar's headings.
 *
 * A starred room appears **only** under Starred — showing it twice would make
 * the unread badges look duplicated and inflate the apparent room count.
 * Forums are separated from streams because they read differently: a forum row
 * points at a list of posts, a stream row at a live timeline.
 */
export function groupChannels({
  channels,
  starredChannelIds,
  sortMode = DEFAULT_SORT_MODE,
  lastActivityAt,
}: {
  channels: Channel[];
  starredChannelIds: ReadonlySet<string>;
  sortMode?: ChannelSortMode;
  lastActivityAt?: (channelId: string) => number | null;
}): ChannelGroup[] {
  const starred: Channel[] = [];
  const streams: Channel[] = [];
  const forums: Channel[] = [];

  for (const channel of channels) {
    if (starredChannelIds.has(channel.id)) {
      starred.push(channel);
    } else if (channel.type === "forum") {
      forums.push(channel);
    } else {
      streams.push(channel);
    }
  }

  const order = (list: Channel[]) =>
    sortChannels(list, sortMode, lastActivityAt);

  return [
    { key: "starred", title: "Starred", channels: order(starred) },
    { key: "channels", title: "Channels", channels: order(streams) },
    { key: "forums", title: "Forums", channels: order(forums) },
  ];
}
