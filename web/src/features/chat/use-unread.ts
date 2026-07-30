/**
 * Unread badge state, polled rather than streamed. See `unread.ts` for why.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { postRelayQuery } from "@/shared/api/relay-http";
import {
  buildUnreadProbeFilters,
  channelsWithActivity,
} from "@/features/chat/unread";

/**
 * How often the probe re-asks.
 *
 * A pull cannot be instant, and this is the visible cost of not streaming every
 * message. Short enough that a badge is not stale for long, long enough that an
 * idle tab is not making a request a second.
 */
const UNREAD_POLL_MS = 30_000;

export interface UnreadApi {
  isUnread: (channelId: string) => boolean;
  /** True until the first probe answers, so the sidebar can stay quiet. */
  isLoading: boolean;
}

export function useUnreadChannels(
  channelIds: string[],
  contexts: Record<string, number>,
): UnreadApi {
  // Cursors are part of the key: reading a channel moves its cursor, and the
  // badge should clear on the next probe rather than persisting until the timer.
  const probeKey = useMemo(
    () =>
      channelIds
        .map((channelId) => `${channelId}:${contexts[channelId] ?? 0}`)
        .sort()
        .join(","),
    [channelIds, contexts],
  );

  const query = useQuery<Set<string>>({
    queryKey: ["chat", "unread", probeKey],
    enabled: channelIds.length > 0,
    refetchInterval: UNREAD_POLL_MS,
    // The app disables focus refetching globally; a returning reader is exactly
    // when a stale badge is most visible, so this query opts back in.
    refetchOnWindowFocus: true,
    // Keep the previous answer on screen while re-probing, so badges do not
    // blink off and back on every poll.
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const chunks = buildUnreadProbeFilters(
        channelIds,
        contexts,
        Math.floor(Date.now() / 1000),
      );
      const responses = await Promise.all(
        chunks.map((filters) => postRelayQuery(filters)),
      );
      return channelsWithActivity(responses.flat());
    },
  });

  return useMemo(
    () => ({
      isUnread: (channelId: string) => query.data?.has(channelId) ?? false,
      isLoading: query.isPending,
    }),
    [query.data, query.isPending],
  );
}
