/**
 * Chat data hooks over the {@link RelaySession}.
 *
 * The channel list, the timeline, and reactions use three different mechanisms,
 * each forced by a protocol constraint rather than chosen for style. See
 * {@link useChannels} and `timeline.ts`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRelaySession } from "@/shared/api/relay-provider";
import { resolveSigner } from "@/shared/lib/signer";
import type { NostrEvent } from "@/shared/lib/nostr-client";
import {
  type Channel,
  buildChannelListFilter,
  buildChannelTimelineFilter,
  buildMessageTemplate,
  buildReactionFilter,
  buildReactionTemplate,
  buildReactionWithdrawalFilter,
  buildReactionWithdrawalTemplate,
  buildReplyTemplate,
  chunkIds,
  toChannelList,
} from "@/features/chat/chat-model";
import {
  type TimelineRow,
  deriveTimeline,
  mergeEvents,
  reactableIds,
  reactionEventIds,
} from "@/features/chat/timeline";

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

/** The reading user's public key, once the signer resolves it. */
export function useMyPubkey(): string | null {
  const [pubkey, setPubkey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveSigner()
      .getPublicKey()
      .then((key) => {
        if (active) setPubkey(key);
      })
      .catch(() => {
        // No signer available: the timeline still reads, and "mine" reactions
        // simply cannot be identified.
      });
    return () => {
      active = false;
    };
  }, []);

  return pubkey;
}

export interface ChannelTimeline {
  rows: TimelineRow[];
  /** Stored history has arrived; the subscription is now tailing live. */
  loaded: boolean;
  /** Set when the relay refused the subscription (auth, membership, …). */
  error: string | null;
}

/**
 * One channel's timeline, including reactions, edits, and deletions.
 *
 * Three subscriptions, because the events live in different filter spaces:
 *
 * 1. `#h` — messages, system rows, edits (40003), Buzz deletes (9005).
 * 2. `#e` over the loaded message ids — reactions (7) and NIP-09 deletes (5),
 *    neither of which carries an `h` tag.
 * 3. `#e` over the loaded reaction ids — withdrawals, which are kind:5 against
 *    the *reaction* event and so invisible from the message id.
 *
 * All events land in one id-keyed map; rows are derived from it, so arrival order
 * and reconnect replays do not matter.
 */
export function useChannelMessages(channelId: string | null): ChannelTimeline {
  const session = useRelaySession();
  const myPubkey = useMyPubkey();
  const [events, setEvents] = useState<Map<string, NostrEvent>>(
    () => new Map(),
  );
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const absorb = useCallback((event: NostrEvent) => {
    setEvents((previous) => mergeEvents(previous, [event]));
  }, []);

  useEffect(() => {
    // Reset per channel so the previous room's events never bleed through.
    setEvents(new Map());
    setLoaded(false);
    setError(null);

    if (!channelId) return;

    return session.subscribe(
      buildChannelTimelineFilter(channelId, TIMELINE_LIMIT),
      {
        onEvent: absorb,
        onEose: () => setLoaded(true),
        onClosed: (reason) => {
          setError(reason);
          setLoaded(true);
        },
      },
    );
  }, [session, channelId, absorb]);

  const rows = useMemo(
    () => deriveTimeline(events, myPubkey),
    [events, myPubkey],
  );

  // Joined keys, so an effect re-runs only when the id *set* changes rather than
  // on every re-render. A new message extends the tail chunk, which costs one
  // re-subscribe — the cost of reactions being unreachable by `#h`.
  const messageIdKey = reactableIds(rows).join(",");
  const reactionIdKey = reactionEventIds(events).join(",");

  useEffect(() => {
    if (!messageIdKey) return;
    const unsubscribes = chunkIds(messageIdKey.split(",")).map((chunk) =>
      session.subscribe(buildReactionFilter(chunk), { onEvent: absorb }),
    );
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [session, messageIdKey, absorb]);

  useEffect(() => {
    if (!reactionIdKey) return;
    const unsubscribes = chunkIds(reactionIdKey.split(",")).map((chunk) =>
      session.subscribe(buildReactionWithdrawalFilter(chunk), {
        onEvent: absorb,
      }),
    );
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [session, reactionIdKey, absorb]);

  return { rows, loaded, error };
}

/**
 * Send a message, or a reply when `thread` is given.
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
    mutationFn: async (input: {
      content: string;
      thread?: { rootId: string; parentId: string };
      /** NIP-92 `imeta` tags for attachments already uploaded. */
      attachments?: string[][];
    }) => {
      if (!channelId) {
        throw new Error("No channel selected");
      }
      const trimmed = input.content.trim();
      const attachments = input.attachments ?? [];
      // An attachment is a message on its own: requiring text alongside it would
      // mean a picture could not be posted without a caption.
      if (!trimmed && attachments.length === 0) {
        throw new Error("Message is empty");
      }
      const template = input.thread
        ? buildReplyTemplate(channelId, trimmed, input.thread)
        : buildMessageTemplate(channelId, trimmed);
      return session.publish({
        ...template,
        tags: [...template.tags, ...attachments],
      });
    },
    onSuccess: () => {
      // A first message in a channel can change what the sidebar should show.
      void queryClient.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}

/**
 * Add or withdraw a reaction.
 *
 * Withdrawal needs the reader's own kind:7 event id, which the derived row
 * already carries — so unlike the desktop client this never has to query the
 * relay to find the event it is about to delete.
 */
export function useToggleReaction() {
  const session = useRelaySession();

  return useMutation({
    mutationFn: async (input: {
      messageId: string;
      emoji: string;
      myReactionId?: string;
    }) =>
      session.publish(
        input.myReactionId
          ? buildReactionWithdrawalTemplate(input.myReactionId)
          : buildReactionTemplate(input.messageId, input.emoji),
      ),
  });
}
