import { useCallback, useEffect, useMemo, useState } from "react";

import { useMyPubkey } from "@/features/chat/use-chat";
import {
  EMPTY_STORE,
  readChannelFlags,
  toggleChannelFlag,
  writeChannelFlags,
  type ChannelFlag,
} from "@/features/shell/lib/channel-flags";

export interface ChannelFlagApi {
  channelIds: ReadonlySet<string>;
  has: (channelId: string) => boolean;
  toggle: (channelId: string) => void;
}

/**
 * One local per-channel preference for the reading user.
 *
 * Loaded once the signer has resolved a pubkey — the store is per-identity, so
 * reading it before then would either need a shared bucket or a later
 * correction, and both show the reader the wrong sidebar for a moment.
 */
export function useChannelFlag(flag: ChannelFlag): ChannelFlagApi {
  const pubkey = useMyPubkey();
  const [store, setStore] = useState(EMPTY_STORE);

  useEffect(() => {
    if (!pubkey) return;
    setStore(readChannelFlags(flag, pubkey));
  }, [flag, pubkey]);

  const toggle = useCallback(
    (channelId: string) => {
      if (!pubkey) return;
      setStore((current) => {
        const next = toggleChannelFlag(current, channelId);
        writeChannelFlags(flag, pubkey, next);
        return next;
      });
    },
    [flag, pubkey],
  );

  const channelIds = useMemo(
    () => new Set(store.channelIds),
    [store.channelIds],
  );

  const has = useCallback(
    (channelId: string) => channelIds.has(channelId),
    [channelIds],
  );

  return { channelIds, has, toggle };
}
