/**
 * Pure mapping between relay events and the chat view model.
 *
 * Kept free of React and of the relay session so the parsing rules — which
 * encode real protocol constraints — are unit-testable on their own.
 */

import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";

import {
  CHANNEL_TIMELINE_CONTENT_KINDS,
  KIND_NIP29_GROUP_METADATA,
  KIND_STREAM_MESSAGE,
  KIND_SYSTEM_MESSAGE,
} from "@/shared/constants/kinds";
import {
  type ImetaEntry,
  parseImetaTags,
} from "@/shared/ui/markdown/parse-imeta";

export type ChannelType = "stream" | "forum" | "dm" | string;

export interface Channel {
  /** Channel UUID — the value carried in the `h` tag. */
  id: string;
  name: string;
  about: string | null;
  topic: string | null;
  type: ChannelType;
  isPrivate: boolean;
  /** NIP-29 `hidden`: DMs, which should stay out of the channel list. */
  hidden: boolean;
  archived: boolean;
  updatedAt: number;
}

export interface Message {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  /** A relay-authored row (join/leave/archive notices) rather than a person's. */
  system: boolean;
  /** Root event id when this message is a thread reply. */
  rootId: string | null;
  /** Direct parent event id when this message is a reply. */
  parentId: string | null;
  /**
   * NIP-92 attachment metadata, keyed by URL. Absent when the message carries no
   * `imeta` tag, so the common case allocates nothing.
   */
  imeta?: Map<string, ImetaEntry>;
}

function firstTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

function hasTag(event: NostrEvent, name: string): boolean {
  return event.tags.some((tag) => tag[0] === name);
}

/**
 * Deduplicate NIP-33 addressable events, keeping the newest per
 * `(pubkey, kind, d)`.
 *
 * The relay stores channel metadata channel-scoped, so a cold read can surface
 * several generations of the same `d` tag; only the newest describes the channel
 * as it exists now.
 */
export function dedupeAddressable(events: NostrEvent[]): NostrEvent[] {
  const newest = new Map<string, NostrEvent>();
  for (const event of events) {
    const key = `${event.pubkey}:${event.kind}:${firstTag(event, "d") ?? ""}`;
    const previous = newest.get(key);
    if (!previous || event.created_at > previous.created_at) {
      newest.set(key, event);
    }
  }
  return [...newest.values()];
}

/**
 * Parse a kind:39000 group-metadata event into a {@link Channel}.
 *
 * Returns null when the event carries no `d` tag: without it there is no channel
 * id, and guessing one would attach messages to the wrong room.
 */
export function eventToChannel(event: NostrEvent): Channel | null {
  if (event.kind !== KIND_NIP29_GROUP_METADATA) return null;
  const id = firstTag(event, "d");
  if (!id) return null;

  return {
    id,
    name: firstTag(event, "name") ?? id,
    about: firstTag(event, "about") ?? null,
    topic: firstTag(event, "topic") ?? null,
    type: firstTag(event, "t") ?? "stream",
    // NIP-29 marks restricted groups with a bare `private` tag; Buzz also emits
    // an explicit `public` tag, so absence of `private` is the safe reading.
    isPrivate: hasTag(event, "private"),
    hidden: hasTag(event, "hidden"),
    archived: firstTag(event, "archived") === "true",
    updatedAt: event.created_at,
  };
}

/**
 * Channels for the sidebar: newest metadata per channel, DMs and archived rooms
 * removed, sorted by name.
 */
export function toChannelList(events: NostrEvent[]): Channel[] {
  return dedupeAddressable(events)
    .map(eventToChannel)
    .filter((channel): channel is Channel => channel !== null)
    .filter((channel) => !channel.hidden && !channel.archived)
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Resolve the thread position of a message from its `e` tags.
 *
 * `buzz-sdk` writes `["e", root, "", "root"]` plus `["e", parent, "", "reply"]`
 * for a nested reply, and a single `["e", root, "", "reply"]` for a direct one —
 * so a lone marked `reply` tag is both root and parent.
 */
export function parseThreadRefs(event: NostrEvent): {
  rootId: string | null;
  parentId: string | null;
} {
  const eTags = event.tags.filter((tag) => tag[0] === "e" && tag[1]);
  if (eTags.length === 0) {
    return { rootId: null, parentId: null };
  }

  const marked = (marker: string) =>
    eTags.find((tag) => tag[3] === marker)?.[1] ?? null;

  const root = marked("root");
  const reply = marked("reply");

  if (root && reply) {
    return { rootId: root, parentId: reply };
  }
  if (reply) {
    return { rootId: reply, parentId: reply };
  }
  if (root) {
    return { rootId: root, parentId: root };
  }
  // Unmarked `e` tags (NIP-10 positional form): first is the root, last the
  // parent. With one tag they coincide.
  const first = eTags[0]?.[1] ?? null;
  const last = eTags[eTags.length - 1]?.[1] ?? null;
  return { rootId: first, parentId: last };
}

/** Parse a timeline content event into a {@link Message}. */
export function eventToMessage(event: NostrEvent): Message | null {
  if (!CHANNEL_TIMELINE_CONTENT_KINDS.includes(event.kind)) return null;
  const { rootId, parentId } = parseThreadRefs(event);
  const imeta = parseImetaTags(event.tags);
  return {
    id: event.id,
    pubkey: event.pubkey,
    content: event.content,
    createdAt: event.created_at,
    system: event.kind === KIND_SYSTEM_MESSAGE,
    rootId,
    parentId,
    ...(imeta.size > 0 ? { imeta } : {}),
  };
}

/**
 * Merge newly delivered events into a timeline.
 *
 * Reconnects re-send the same filter, so the same event id arrives more than
 * once; the accumulator is keyed by id and the result is ordered oldest-first.
 */
export function mergeTimeline(
  existing: Map<string, Message>,
  events: NostrEvent[],
): Map<string, Message> {
  let changed = false;
  const merged = new Map(existing);
  for (const event of events) {
    if (merged.has(event.id)) continue;
    const message = eventToMessage(event);
    if (!message) continue;
    merged.set(message.id, message);
    changed = true;
  }
  // Preserve reference identity when nothing was added so React can skip work.
  return changed ? merged : existing;
}

/** Timeline messages in display order (oldest first). */
export function sortTimeline(messages: Map<string, Message>): Message[] {
  return [...messages.values()].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }
    // Equal timestamps are common at one-second resolution; the id keeps the
    // order stable instead of letting it flip between renders.
    return left.id.localeCompare(right.id);
  });
}

/** Historical + live filter for one channel's timeline. */
export function buildChannelTimelineFilter(
  channelId: string,
  limit: number,
): NostrFilter {
  return {
    kinds: CHANNEL_TIMELINE_CONTENT_KINDS,
    "#h": [channelId],
    limit,
  };
}

/** Cold-read filter for the channel list. */
export function buildChannelListFilter(limit: number): NostrFilter {
  return { kinds: [KIND_NIP29_GROUP_METADATA], limit };
}

/** Event template for a chat message, matching `buzz-sdk::build_message`. */
export function buildMessageTemplate(
  channelId: string,
  content: string,
): { kind: number; tags: string[][]; content: string } {
  return {
    kind: KIND_STREAM_MESSAGE,
    tags: [["h", channelId]],
    content,
  };
}
