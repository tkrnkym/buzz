import { useCallback, useEffect, useMemo, useState } from "react";

import { useMyPubkey } from "@/features/chat/use-chat";
import {
  EMPTY_STORE,
  readChannelStars,
  toggleChannelStar,
  writeChannelStars,
} from "@/features/shell/lib/channel-stars";

export interface ChannelStarsApi {
  starredChannelIds: ReadonlySet<string>;
  isStarred: (channelId: string) => boolean;
  toggleStar: (channelId: string) => void;
}

/**
 * The reading user's starred channels.
 *
 * Loaded once the signer has resolved a pubkey — the store is per-identity, so
 * reading it before then would either need a shared bucket or a later
 * correction, and both show the reader the wrong sidebar for a moment.
 */
export function useChannelStars(): ChannelStarsApi {
  const pubkey = useMyPubkey();
  const [store, setStore] = useState(EMPTY_STORE);

  useEffect(() => {
    if (!pubkey) return;
    setStore(readChannelStars(pubkey));
  }, [pubkey]);

  const toggleStar = useCallback(
    (channelId: string) => {
      if (!pubkey) return;
      setStore((current) => {
        const next = toggleChannelStar(current, channelId);
        writeChannelStars(pubkey, next);
        return next;
      });
    },
    [pubkey],
  );

  const starredChannelIds = useMemo(
    () => new Set(store.channelIds),
    [store.channelIds],
  );

  const isStarred = useCallback(
    (channelId: string) => starredChannelIds.has(channelId),
    [starredChannelIds],
  );

  return { starredChannelIds, isStarred, toggleStar };
}
