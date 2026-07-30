/**
 * Presence and typing hooks.
 *
 * See `presence.ts` for why presence needs two transports and typing needs one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRelaySession } from "@/shared/api/relay-provider";
import { postRelayQuery } from "@/shared/api/relay-http";
import type { NostrEvent } from "@/shared/lib/nostr-client";
import {
  PRESENCE_HEARTBEAT_MS,
  type PresenceStatus,
  TYPING_REPUBLISH_MS,
  type TypingEntry,
  type TypingState,
  buildPresenceFilter,
  buildPresenceTemplate,
  buildTypingFilter,
  buildTypingTemplate,
  completeTyping,
  foldPresence,
  pruneTyping,
  registerTyping,
  typingList,
} from "@/features/chat/presence";
import { useMyPubkey } from "@/features/chat/use-chat";

/** How often the typing set is swept for expiry. */
const TYPING_PRUNE_MS = 1_000;

/**
 * Fetch a presence snapshot over HTTP.
 *
 * Deliberately not a WebSocket REQ: presence is ephemeral, so the relay has
 * nothing stored to answer a subscription with. `POST /query` is the only path
 * that reads current status out of Redis, and only for filters that name the
 * presence kind together with explicit authors.
 */
function fetchPresenceSnapshot(pubkeys: string[]): Promise<NostrEvent[]> {
  if (pubkeys.length === 0) return Promise.resolve([]);
  return postRelayQuery([buildPresenceFilter(pubkeys)]);
}

export interface PresenceApi {
  statusOf: (pubkey: string) => PresenceStatus | null;
}

/**
 * Presence for the given people.
 *
 * Snapshot over HTTP for initial state, subscription for live changes: the two
 * together are what make a status both correct on arrival and current afterwards.
 * Own heartbeat keeps this client visible to everyone else.
 */
export function usePresence(pubkeys: string[]): PresenceApi {
  const session = useRelaySession();
  const myPubkey = useMyPubkey();
  const [statuses, setStatuses] = useState<
    Map<string, { status: PresenceStatus; at: number }>
  >(() => new Map());

  // Joined key so the effects re-run on set changes, not on every render.
  const pubkeyKey = useMemo(
    () =>
      [...new Set(pubkeys.map((key) => key.toLowerCase()))].sort().join(","),
    [pubkeys],
  );

  const absorb = useCallback((events: NostrEvent[]) => {
    setStatuses((previous) => {
      const merged = new Map(previous);
      for (const [pubkey, entry] of foldPresence(events)) {
        const current = merged.get(pubkey);
        if (current && current.at >= entry.at) continue;
        merged.set(pubkey, entry);
      }
      return merged;
    });
  }, []);

  useEffect(() => {
    if (!pubkeyKey) return;
    let active = true;
    void fetchPresenceSnapshot(pubkeyKey.split(",")).then(
      (events) => {
        if (active) absorb(events);
      },
      () => {
        // Presence is decoration: a failed snapshot leaves statuses unknown
        // rather than breaking the timeline.
      },
    );
    return () => {
      active = false;
    };
  }, [pubkeyKey, absorb]);

  useEffect(() => {
    if (!pubkeyKey) return;
    return session.subscribe(buildPresenceFilter(pubkeyKey.split(",")), {
      onEvent: (event) => absorb([event]),
    });
  }, [session, pubkeyKey, absorb]);

  // Heartbeat, so other clients see this one as online.
  useEffect(() => {
    if (!myPubkey) return;
    const beat = () => {
      void session.publish(buildPresenceTemplate("online")).catch(() => {
        // Fire-and-forget: a missed beat expires in Redis on its own.
      });
    };
    beat();
    const timer = window.setInterval(beat, PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [session, myPubkey]);

  const statusOf = useCallback(
    (pubkey: string) => statuses.get(pubkey.toLowerCase())?.status ?? null,
    [statuses],
  );

  return useMemo(() => ({ statusOf }), [statusOf]);
}

export interface TypingApi {
  typists: TypingEntry[];
  /** Announce that this client is composing. Safe to call on every keystroke. */
  announce: (thread?: { rootId: string; parentId: string }) => void;
  /** Clear a typist once their message lands. */
  complete: (input: { pubkey: string; threadHeadId: string | null }) => void;
}

/** Live typing indicators for one channel. */
export function useTyping(channelId: string | null): TypingApi {
  const session = useRelaySession();
  const myPubkey = useMyPubkey();
  const [state, setState] = useState<TypingState>(() => new Map());
  const lastAnnouncedRef = useRef(0);
  const latestMessageAtRef = useRef(new Map<string, number>());

  useEffect(() => {
    setState(new Map());
    latestMessageAtRef.current = new Map();
    if (!channelId) return;

    return session.subscribe(buildTypingFilter(channelId), {
      onEvent: (event) =>
        setState((previous) =>
          registerTyping({
            state: previous,
            event,
            channelId,
            myPubkey,
            now: Date.now(),
            latestMessageAt: latestMessageAtRef.current,
          }),
        ),
    });
  }, [session, channelId, myPubkey]);

  // Sweep expiries only while someone is typing, so an idle channel costs no
  // timer at all.
  const hasTypists = state.size > 0;
  useEffect(() => {
    if (!hasTypists) return;
    const timer = window.setInterval(
      () => setState((previous) => pruneTyping(previous, Date.now())),
      TYPING_PRUNE_MS,
    );
    return () => window.clearInterval(timer);
  }, [hasTypists]);

  const announce = useCallback(
    (thread?: { rootId: string; parentId: string }) => {
      if (!channelId) return;
      // Throttled well inside the TTL: every keystroke would flood the relay,
      // and one announcement per TTL would flicker.
      const now = Date.now();
      if (now - lastAnnouncedRef.current < TYPING_REPUBLISH_MS) return;
      lastAnnouncedRef.current = now;
      void session.publish(buildTypingTemplate(channelId, thread)).catch(() => {
        // Fire-and-forget: a dropped indicator expires on its own.
      });
    },
    [session, channelId],
  );

  const complete = useCallback(
    (input: { pubkey: string; threadHeadId: string | null }) => {
      const key = `${input.pubkey.toLowerCase()}:${input.threadHeadId ?? "channel"}`;
      latestMessageAtRef.current.set(key, Math.floor(Date.now() / 1000));
      setState((previous) => completeTyping(previous, input));
    },
    [],
  );

  return useMemo(
    () => ({ typists: typingList(state), announce, complete }),
    [state, announce, complete],
  );
}
