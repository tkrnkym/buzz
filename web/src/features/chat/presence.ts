/**
 * Presence and typing: the two ephemeral signals in a channel.
 *
 * Both are kind 2xxxx events, which the relay never stores — so neither can be
 * read back from history, and each needs its own path:
 *
 * **Presence (kind 20001).** Current status lives in Redis, not in the event log.
 * The relay synthesizes it for a `POST /query` whose filters name kind 20001 *and*
 * explicit authors (`synthesize_presence` in `crates/nuxx-relay/src/api/
 * bridge.rs`) — a WebSocket REQ gets nothing, because there is nothing stored to
 * return. Live changes do fan out over the socket, so the working shape is an
 * HTTP snapshot for initial state plus a subscription for deltas.
 *
 * **Typing (kind 20002).** Live-only by nature. Scoped with an `h` tag, plus an
 * `e` tag when the typist is composing a thread reply.
 */

import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";

import {
  KIND_PRESENCE_UPDATE,
  KIND_TYPING_INDICATOR,
} from "@/shared/constants/kinds";

export type PresenceStatus = "online" | "away" | "offline" | string;

/** How long a typing indicator stays live after the event's `created_at`. */
export const TYPING_TTL_MS = 8_000;
/** How often a composing client re-announces, comfortably inside the TTL. */
export const TYPING_REPUBLISH_MS = 4_000;
/**
 * Quiet window after someone's own message lands.
 *
 * A typing event published just before the message often arrives just after it,
 * which would show "typing…" for someone who has visibly finished.
 */
export const TYPING_POST_MESSAGE_SUPPRESS_MS = 2_000;

/** Own heartbeat interval. Presence in Redis outlives one missed beat. */
export const PRESENCE_HEARTBEAT_MS = 45_000;

/**
 * Presence snapshot filter.
 *
 * Authors are mandatory: the relay only synthesizes presence for a filter that
 * names exactly one presence kind *and* a non-empty author list. Without them the
 * query falls through to the stored-event path and returns nothing, since
 * ephemeral events are never stored.
 */
export function buildPresenceFilter(pubkeys: string[]): NostrFilter {
  return { kinds: [KIND_PRESENCE_UPDATE], authors: pubkeys };
}

/** Live typing indicators for one channel. */
export function buildTypingFilter(channelId: string): NostrFilter {
  return { kinds: [KIND_TYPING_INDICATOR], "#h": [channelId] };
}

export const PRESENCE_STATUSES = ["online", "away", "offline"] as const;

/** What each status is called in the UI. "Invisible" is plainer than "offline". */
export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: "Online",
  away: "Away",
  offline: "Invisible",
};

/**
 * Own presence heartbeat. Channel-less: presence is a property of the person.
 *
 * The status goes in both the content and a `status` tag, matching
 * `nuxx-sdk::build_presence_update`. Not redundancy for its own sake: the relay
 * reads the content, and the tag is what makes the value reachable to a filter.
 * This client emitted no tag for a while, which produced presence events other
 * Nuxx clients do not.
 */
export function buildPresenceTemplate(status: PresenceStatus): {
  kind: number;
  tags: string[][];
  content: string;
} {
  return {
    kind: KIND_PRESENCE_UPDATE,
    tags: [["status", status]],
    content: status,
  };
}

/**
 * Typing announcement, matching the desktop client's shape.
 *
 * `thread` is set while composing a reply so a reader sees "typing" against the
 * thread rather than the room.
 */
export function buildTypingTemplate(
  channelId: string,
  thread?: { rootId: string; parentId: string },
): { kind: number; tags: string[][]; content: string } {
  const tags: string[][] = [["h", channelId]];
  if (thread) {
    if (thread.rootId === thread.parentId) {
      tags.push(["e", thread.rootId, "", "reply"]);
    } else {
      tags.push(["e", thread.rootId, "", "root"]);
      tags.push(["e", thread.parentId, "", "reply"]);
    }
  }
  return { kind: KIND_TYPING_INDICATOR, tags, content: "" };
}

/** Status per pubkey, keeping the newest event per author. */
export function foldPresence(
  events: NostrEvent[],
): Map<string, { status: PresenceStatus; at: number }> {
  const byPubkey = new Map<string, { status: PresenceStatus; at: number }>();
  for (const event of events) {
    if (event.kind !== KIND_PRESENCE_UPDATE) continue;
    const pubkey = event.pubkey.toLowerCase();
    const current = byPubkey.get(pubkey);
    if (current && current.at >= event.created_at) continue;
    byPubkey.set(pubkey, {
      status: parsePresenceStatus(event.content),
      at: event.created_at,
    });
  }
  return byPubkey;
}

/**
 * Read a status from presence content.
 *
 * The relay accepts both a bare string and a legacy `{"status":"…"}` object, so a
 * client that only understood one of them would show half its users as unknown.
 */
export function parsePresenceStatus(content: string): PresenceStatus {
  const raw = content.trim();
  if (!raw.startsWith("{")) return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "status" in parsed) {
      const status = (parsed as { status?: unknown }).status;
      if (typeof status === "string") return status;
    }
  } catch {
    // Not JSON after all — fall through to the raw value.
  }
  return raw;
}

export interface TypingEntry {
  pubkey: string;
  /** Thread the typist is replying in, or null for the channel itself. */
  threadHeadId: string | null;
  expiresAt: number;
  /** First time this typist was seen, so the display order stays stable. */
  firstSeenAt: number;
}

export type TypingState = Map<string, TypingEntry>;

function typingKey(pubkey: string, threadHeadId: string | null): string {
  return `${pubkey}:${threadHeadId ?? "channel"}`;
}

/** The `e` tag marking which thread a typing event belongs to. */
function typingThreadHead(event: NostrEvent): string | null {
  const eTags = event.tags.filter((tag) => tag[0] === "e" && tag[1]);
  if (eTags.length === 0) return null;
  const reply = eTags.find((tag) => tag[3] === "reply")?.[1];
  return reply ?? eTags[eTags.length - 1]?.[1] ?? null;
}

export interface RegisterTypingInput {
  state: TypingState;
  event: NostrEvent;
  channelId: string;
  /** Excluded: a client never shows the reader their own typing. */
  myPubkey: string | null;
  now: number;
  /** Newest message `created_at` per typist, so a finished author stops typing. */
  latestMessageAt: Map<string, number>;
}

/**
 * Fold a typing event into the live set.
 *
 * Returns the same state object when nothing changed, so React can skip work on
 * the steady stream of re-announcements.
 */
export function registerTyping(input: RegisterTypingInput): TypingState {
  const { state, event, channelId, myPubkey, now, latestMessageAt } = input;

  if (event.kind !== KIND_TYPING_INDICATOR) return state;
  if (event.tags.find((tag) => tag[0] === "h")?.[1] !== channelId) return state;

  const pubkey = event.pubkey.toLowerCase();
  if (myPubkey && pubkey === myPubkey.toLowerCase()) return state;

  const expiresAt = event.created_at * 1000 + TYPING_TTL_MS;
  if (expiresAt <= now) return state;

  const threadHeadId = typingThreadHead(event);
  const key = typingKey(pubkey, threadHeadId);

  // A typing event at or before this author's newest message is stale: they
  // already sent what they were writing.
  const newestMessageAt = latestMessageAt.get(key) ?? 0;
  if (event.created_at <= newestMessageAt) return state;

  const next = new Map(state);
  const existing = next.get(key);
  next.set(key, {
    pubkey,
    threadHeadId,
    expiresAt: Math.min(now + TYPING_TTL_MS, expiresAt),
    firstSeenAt: existing?.firstSeenAt ?? now,
  });
  return next;
}

/** Drop expired typists. Same-object return when nothing expired. */
export function pruneTyping(state: TypingState, now: number): TypingState {
  let changed = false;
  const next: TypingState = new Map();
  for (const [key, entry] of state) {
    if (entry.expiresAt > now) {
      next.set(key, entry);
      continue;
    }
    changed = true;
  }
  return changed ? next : state;
}

/** Clear a typist once their message arrives, and record the completion time. */
export function completeTyping(
  state: TypingState,
  input: { pubkey: string; threadHeadId: string | null },
): TypingState {
  const key = typingKey(input.pubkey.toLowerCase(), input.threadHeadId);
  if (!state.has(key)) return state;
  const next = new Map(state);
  next.delete(key);
  return next;
}

/** Live typists in stable display order. */
export function typingList(state: TypingState): TypingEntry[] {
  return [...state.values()].sort(
    (left, right) => left.firstSeenAt - right.firstSeenAt,
  );
}
