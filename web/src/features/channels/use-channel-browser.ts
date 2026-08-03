import { useEffect, useMemo, useState } from "react";

import {
  joinedChannelIds,
  partitionChannels,
} from "@/features/channels/channel-browser";
import type { Channel } from "@/features/chat/chat-model";
import { useMyPubkey } from "@/features/chat/use-chat";
import { buildMemberListFilter } from "@/features/directory/directory-model";
import { useShell } from "@/features/shell/shell-context";
import { postRelayQuery } from "@/shared/api/relay-http";

/**
 * The community's rooms, split by whether this reader is in them.
 *
 * The channel list the shell already holds is every kind:39000 the relay serves
 * — which for an open community includes rooms nobody here has joined. That is
 * what makes discovery possible; membership is the separate fact, read from the
 * kind:39002 lists.
 */
export function useChannelBrowser(): {
  joined: Channel[];
  available: Channel[];
  loading: boolean;
} {
  const { channels } = useShell();
  const myPubkey = useMyPubkey();
  const [joinedIds, setJoinedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(true);

  const channelKey = channels.map((channel) => channel.id).join(",");

  useEffect(() => {
    const filter = buildMemberListFilter(
      channelKey ? channelKey.split(",") : [],
    );
    if (!filter) {
      setJoinedIds(new Set());
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);

    postRelayQuery([filter])
      .then((events) => {
        if (!active) return;
        setJoinedIds(joinedChannelIds(events, myPubkey));
      })
      .catch(() => {
        // Without membership every open room reads as "available". Better than
        // an empty page: the Join is idempotent, and the relay is the authority
        // on whether it is needed.
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [channelKey, myPubkey]);

  return useMemo(
    () => ({ ...partitionChannels({ channels, joinedIds }), loading }),
    [channels, joinedIds, loading],
  );
}
