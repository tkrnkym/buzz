/**
 * Pure mapping between relay events and the chat view model.
 *
 * Kept free of React and of the relay session so the parsing rules — which
 * encode real protocol constraints — are unit-testable on their own.
 */

import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";

import {
  CHANNEL_E_SCOPED_KINDS,
  CHANNEL_H_SCOPED_KINDS,
  CHANNEL_TIMELINE_CONTENT_KINDS,
  KIND_DELETION,
  KIND_NIP29_DELETE_EVENT,
  KIND_NIP29_GROUP_METADATA,
  KIND_REACTION,
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_EDIT,
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
  /**
   * Participants, from the `p` tags the relay puts on a DM's metadata.
   *
   * Only DMs carry these. It is what lets a DM be labelled by who is in it
   * without a second fetch — a DM's own `name` is a generic placeholder.
   */
  participantPubkeys: string[];
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
    // NIP-29 marks restricted groups with a bare `private` tag; Nuxx also emits
    // an explicit `public` tag, so absence of `private` is the safe reading.
    isPrivate: hasTag(event, "private"),
    hidden: hasTag(event, "hidden"),
    archived: firstTag(event, "archived") === "true",
    participantPubkeys: event.tags
      .filter((tag) => tag[0] === "p" && typeof tag[1] === "string")
      .map((tag) => (tag[1] as string).toLowerCase()),
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
 * Direct messages: the rooms `toChannelList` deliberately leaves out.
 *
 * Selected on the channel type rather than on `hidden`, which is a display hint
 * the relay may set on other kinds of room later. Newest first, because a DM list
 * is read as a conversation list — the room that just moved belongs at the top,
 * not under whichever name sorts first.
 */
export function toDmList(events: NostrEvent[]): Channel[] {
  return dedupeAddressable(events)
    .map(eventToChannel)
    .filter((channel): channel is Channel => channel !== null)
    .filter((channel) => channel.type === "dm" && !channel.archived)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

/**
 * Resolve the thread position of a message from its `e` tags.
 *
 * `nuxx-sdk` writes `["e", root, "", "root"]` plus `["e", parent, "", "reply"]`
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
 * Historical + live filter for one channel's timeline.
 *
 * Asks for the modifiers that carry an `h` tag as well as the content kinds —
 * see `CHANNEL_H_SCOPED_KINDS`. A filter naming only the content kinds renders a
 * timeline that looks complete and silently ignores every edit and every
 * tombstone.
 */
export function buildChannelTimelineFilter(
  channelId: string,
  limit: number,
): NostrFilter {
  return {
    kinds: CHANNEL_H_SCOPED_KINDS,
    "#h": [channelId],
    limit,
  };
}

/**
 * A page cursor: the `(created_at, id)` of the oldest row already loaded.
 *
 * Both halves are required. Paging on a timestamp alone loses and duplicates
 * rows whenever several messages share a second — the relay's own window spec
 * calls that "the dense-second dup/loss bug this surface exists to kill" — and a
 * busy channel produces those constantly.
 */
export interface HistoryCursor {
  createdAt: number;
  id: string;
}

/**
 * Filter for one page of older history.
 *
 * `before_id` is a Nuxx bridge extension on `POST /query`, not vanilla NIP-01,
 * and it is the reason this read cannot go over the WebSocket: a WS `REQ` can
 * only express `until`, so it can only page ambiguously. The relay pairs the two
 * into a keyset — `created_at < until OR (created_at = until AND id > before_id)`
 * against `ORDER BY created_at DESC, id ASC` — which walks dense seconds exactly
 * once (`crates/nuxx-db/src/event.rs`).
 *
 * The relay rejects `before_id` without `until`, so the cursor is passed as one
 * value rather than two optional fields that could disagree.
 */
export function buildChannelHistoryFilter(
  channelId: string,
  limit: number,
  cursor: HistoryCursor,
): NostrFilter {
  return {
    kinds: CHANNEL_H_SCOPED_KINDS,
    "#h": [channelId],
    limit,
    until: cursor.createdAt,
    before_id: cursor.id,
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
 * `nuxx-sdk::build_reaction`), so it never reaches an `#h`-scoped subscription.
 * kind:5 is included because the NIP-09 form of a message deletion also omits
 * `h`.
 */
export function buildReactionFilter(messageIds: string[]): NostrFilter {
  return {
    kinds: CHANNEL_E_SCOPED_KINDS,
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

/** Event template for a chat message, matching `nuxx-sdk::build_message`. */
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
 * Event template for a reply, matching `nuxx-sdk::thread_tags`.
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

/** Longest emoji a reaction may carry, per `nuxx-sdk::build_reaction`. */
export const MAX_REACTION_EMOJI_LENGTH = 64;

/**
 * Event template for a NIP-25 reaction, matching `nuxx-sdk::build_reaction`.
 *
 * Deliberately no `h` tag — the SDK omits it, and adding one here would produce
 * events other Nuxx clients do not.
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

/** Longest message body the relay accepts, per `nuxx-sdk::check_content`. */
export const MAX_MESSAGE_CONTENT_BYTES = 64 * 1024;

/**
 * Event template for an edit, matching `nuxx-sdk::build_edit`.
 *
 * An edit is a separate kind:40003 event pointing at the original, not a
 * rewrite of it — a signed event cannot be changed after the fact. The `h` tag
 * is what makes the edit visible to a channel-scoped subscription; without it
 * the timeline would keep showing the original text to everyone already
 * connected.
 */
export function buildEditTemplate(
  channelId: string,
  targetEventId: string,
  content: string,
): { kind: number; tags: string[][]; content: string } {
  return {
    kind: KIND_STREAM_MESSAGE_EDIT,
    tags: [
      ["h", channelId],
      ["e", targetEventId],
    ],
    content,
  };
}

/**
 * Event template for a delete, matching `nuxx-sdk::build_delete_message`.
 *
 * Kind 9005 rather than NIP-09's kind:5: the Nuxx-native tombstone carries the
 * `h` tag, so channel subscribers see the removal. A bare kind:5 carries no
 * channel, and every reader with the timeline already open would go on showing
 * the message.
 *
 * The moderation fields (`action_id`, `reason_code`, `public_reason`) are
 * deliberately not settable here: this is the author deleting their own message,
 * and a client-supplied reason on a self-delete would read as a moderator
 * action.
 */
export function buildDeleteMessageTemplate(
  channelId: string,
  targetEventId: string,
): { kind: number; tags: string[][]; content: string } {
  return {
    kind: KIND_NIP29_DELETE_EVENT,
    tags: [
      ["h", channelId],
      ["e", targetEventId],
    ],
    content: "",
  };
}

/**
 * How far back unread badges look.
 *
 * Matches the desktop client's read-state horizon. A channel whose newest
 * message predates this is not worth badging, and bounding the window is what
 * keeps the initial activity read from scanning the whole history.
 */
export const UNREAD_HORIZON_SECONDS = 7 * 24 * 60 * 60;
