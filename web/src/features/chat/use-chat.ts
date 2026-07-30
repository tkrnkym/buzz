/**
 * Chat data hooks over the {@link RelaySession}.
 *
 * The channel list and the timeline use deliberately different mechanisms, for a
 * protocol reason rather than a stylistic one — see {@link useChannels}.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRelaySession } from "@/shared/api/relay-provider";
import {
  type Channel,
  type Message,
  buildChannelListFilter,
  buildChannelTimelineFilter,
  buildMessageTemplate,
  mergeTimeline,
  sortTimeline,
  toChannelList,
} from "@/features/chat/chat-model";

const CHANNEL_LIST_LIMIT = 500;
const TIMELINE_LIMIT = 100;

/**
 * The channel list.
 *
 * Read with a one-shot query rather than a live subscription: the relay stores
 * kind:39000 channel-scoped, so a global `{kinds:[39000]}` subscription receives
 * no fan-out (see `emit_group_discovery_events` in
 * `crates/buzz-relay/src/handlers/side_effects.rs`). Newly created channels
 * therefore appear on refetch, not instantly — closing that gap needs a
 * relay-side change, not a client one.
 */
export function useChannels() {
  const session = useRelaySession();
  return useQuery<Channel[]>({
    queryKey: ["chat", "channels"],
    queryFn: async () =>
      toChannelList(
        await session.query(buildChannelListFilter(CHANNEL_LIST_LIMIT)),
      ),
  });
}

export interface ChannelTimeline {
  messages: Message[];
  /** Stored history has arrived; the subscription is now tailing live. */
  loaded: boolean;
  /** Set when the relay refused the subscription (auth, membership, …). */
  error: string | null;
}

/**
 * One channel's timeline: stored history followed by the live tail, from a single
 * REQ. Re-subscribes when the channel changes and on reconnect, which re-delivers
 * events — {@link mergeTimeline} dedupes by id.
 */
export function useChannelMessages(channelId: string | null): ChannelTimeline {
  const session = useRelaySession();
  const [byId, setById] = useState<Map<string, Message>>(() => new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId) {
      setById(new Map());
      setLoaded(false);
      setError(null);
      return;
    }

    // Reset per channel so the previous room's messages never bleed through.
    setById(new Map());
    setLoaded(false);
    setError(null);

    return session.subscribe(
      buildChannelTimelineFilter(channelId, TIMELINE_LIMIT),
      {
        onEvent: (event) =>
          setById((previous) => mergeTimeline(previous, [event])),
        onEose: () => setLoaded(true),
        onClosed: (reason) => {
          setError(reason);
          setLoaded(true);
        },
      },
    );
  }, [session, channelId]);

  const messages = useMemo(() => sortTimeline(byId), [byId]);
  return { messages, loaded, error };
}

/**
 * Send a message to a channel.
 *
 * Resolves only once the relay OKs the event, so the composer can surface a
 * rejection (rate limit, membership) instead of showing a message that was never
 * stored. The live subscription delivers the accepted event back, so there is no
 * optimistic insert to reconcile.
 */
export function useSendMessage(channelId: string | null) {
  const session = useRelaySession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      if (!channelId) {
        throw new Error("No channel selected");
      }
      const trimmed = content.trim();
      if (!trimmed) {
        throw new Error("Message is empty");
      }
      return session.publish(buildMessageTemplate(channelId, trimmed));
    },
    onSuccess: () => {
      // A first message in a channel can change what the sidebar should show.
      void queryClient.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}
