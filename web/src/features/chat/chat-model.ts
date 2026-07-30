/**
 * Pure mapping between relay events and the chat view model.
 *
 * Kept free of React and of the relay session so the parsing rules — which
 * encode real protocol constraints — are unit-testable on their own.
 */

import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";

import {
  CHANNEL_TIMELINE_CONTENT_KINDS,
  KIND_DELETION,
  KIND_NIP29_GROUP_METADATA,
  KIND_REACTION,
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

/** Chunk size for `#e` filters, so one REQ stays inside relay filter limits. */
export const AUX_FILTER_CHUNK_SIZE = 100;

/**
 * Limit for `#e`-keyed auxiliary reads.
 *
 * Generous on purpose: one popular message can carry many reactions, and a limit
 * sized for the average message would silently truncate them.
 */
export const MAX_AUX_LIMIT = 10_000;

/** Split ids into chunks a single filter can carry. */
export function chunkIds(
  ids: string[],
  size = AUX_FILTER_CHUNK_SIZE,
): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

/**
 * Reactions and NIP-09 deletions for the given message ids.
 *
 * Keyed by `#e`, not `#h`: a kind:7 reaction carries only an `e` tag (see
 * `buzz-sdk::build_reaction`), so it never reaches an `#h`-scoped subscription.
 * kind:5 is included because the NIP-09 form of a message deletion also omits
 * `h`.
 */
export function buildReactionFilter(messageIds: string[]): NostrFilter {
  return {
    kinds: [KIND_REACTION, KIND_DELETION],
    "#e": messageIds,
    limit: MAX_AUX_LIMIT,
  };
}

/**
 * Withdrawals of the given reaction events.
 *
 * A withdrawn reaction is a kind:5 pointing at the reaction event itself, so it
 * cannot be found from the message id.
 */
export function buildReactionWithdrawalFilter(
  reactionIds: string[],
): NostrFilter {
  return {
    kinds: [KIND_DELETION],
    "#e": reactionIds,
    limit: MAX_AUX_LIMIT,
  };
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

/**
 * Event template for a reply, matching `buzz-sdk::thread_tags`.
 *
 * A direct reply carries one marked `reply` tag; a nested reply carries `root`
 * plus `reply`. Getting this wrong flattens or misparents the thread.
 */
export function buildReplyTemplate(
  channelId: string,
  content: string,
  thread: { rootId: string; parentId: string },
): { kind: number; tags: string[][]; content: string } {
  const tags: string[][] = [["h", channelId]];
  if (thread.rootId === thread.parentId) {
    tags.push(["e", thread.rootId, "", "reply"]);
  } else {
    tags.push(["e", thread.rootId, "", "root"]);
    tags.push(["e", thread.parentId, "", "reply"]);
  }
  return { kind: KIND_STREAM_MESSAGE, tags, content };
}

/** Longest emoji a reaction may carry, per `buzz-sdk::build_reaction`. */
export const MAX_REACTION_EMOJI_LENGTH = 64;

/**
 * Event template for a NIP-25 reaction, matching `buzz-sdk::build_reaction`.
 *
 * Deliberately no `h` tag — the SDK omits it, and adding one here would produce
 * events other Buzz clients do not.
 */
export function buildReactionTemplate(
  targetEventId: string,
  emoji: string,
): { kind: number; tags: string[][]; content: string } {
  if ([...emoji].length > MAX_REACTION_EMOJI_LENGTH) {
    throw new Error(
      `Reaction emoji must be at most ${MAX_REACTION_EMOJI_LENGTH} characters`,
    );
  }
  return {
    kind: KIND_REACTION,
    tags: [["e", targetEventId]],
    content: emoji,
  };
}

/**
 * Event template withdrawing a reaction: a kind:5 against the reaction event.
 *
 * The target is the reader's own kind:7 event, not the message — deleting the
 * message id would be a request to delete the message.
 */
export function buildReactionWithdrawalTemplate(reactionEventId: string): {
  kind: number;
  tags: string[][];
  content: string;
} {
  return {
    kind: KIND_DELETION,
    tags: [["e", reactionEventId]],
    content: "",
  };
}
