/**
 * Unread badge state, subscribed rather than polled. See `unread.ts` for why.
 */

import { useEffect, useMemo, useState } from "react";

import { postRelayQuery } from "@/shared/api/relay-http";
import { useRelaySession } from "@/shared/api/relay-provider";
import {
  type ActivityMap,
  buildActivityFilter,
  isChannelUnread,
  mergeActivity,
  parseActivitySnapshot,
} from "@/features/chat/unread";

export interface UnreadApi {
  isUnread: (channelId: string) => boolean;
  /**
   * Last observed activity for a channel, in seconds, or `null` when no
   * snapshot has mentioned it. Feeds activity-ordered lists (sidebar "recent"
   * sort, the inbox) from the same data the badges use, so a room can never be
   * bold in one place and stale in another.
   */
  lastActivityAt: (channelId: string) => number | null;
  /** True until the first snapshot arrives, so the sidebar can stay quiet. */
  isLoading: boolean;
}

export function useUnreadChannels(contexts: Record<string, number>): UnreadApi {
  const session = useRelaySession();
  const [activity, setActivity] = useState<ActivityMap>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Snapshots are never stored, so a subscription on its own delivers nothing
    // until the next write — a reader opening a quiet community would see no
    // badges at all. `POST /query` synthesizes the current picture on demand,
    // which is what makes the first render correct.
    postRelayQuery([buildActivityFilter()])
      .then((events) => {
        if (cancelled) return;
        setActivity((current) =>
          events.reduce(
            (map, event) => mergeActivity(map, parseActivitySnapshot(event)),
            current,
          ),
        );
      })
      .catch(() => {
        // A failed initial fetch is not fatal: the subscription still carries
        // everything from the next coalescing window onward.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    const unsubscribe = session.subscribe(buildActivityFilter(), {
      onEvent(event) {
        setActivity((current) =>
          mergeActivity(current, parseActivitySnapshot(event)),
        );
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [session]);

  return useMemo(() => {
    // Read the clock once per render rather than once per channel, so every
    // badge in a single paint is judged against the same instant.
    const nowSeconds = Math.floor(Date.now() / 1000);
    return {
      isUnread: (channelId: string) =>
        isChannelUnread(channelId, activity, contexts, nowSeconds),
      lastActivityAt: (channelId: string) => activity[channelId] ?? null,
      isLoading: !loaded,
    };
  }, [activity, contexts, loaded]);
}
