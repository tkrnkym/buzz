/**
 * Notifications: the messages that were addressed to this reader.
 *
 * Message-level, unlike the Inbox next to it, which is room-level. That was a
 * real limit rather than a shortcut — the Inbox is built from the relay's
 * per-channel activity snapshots, which say a room moved and nothing about who
 * said what. Four filters lift it:
 *
 * - `#p` naming the reader — a mention.
 * - `#h` naming the reader's DM channels — a direct message. A DM's participants
 *   ride `p` tags on the *channel metadata*, not on each message, so `#p` alone
 *   finds only the DMs that happen to also mention someone by name.
 * - the reader's own recent messages, which is how their event ids are learned.
 * - `#e` naming those ids — someone replied to them.
 *
 * The last pair is the one worth explaining: a reply carries no `p` tag for the
 * parent's author (see `buildReplyTemplate`), so there is no filter that finds
 * "replies to me" directly. Two round trips, and the second is bounded by how
 * many of the reader's own messages the first asked for — which is also the
 * honest limit of this feature, stated in the UI rather than hidden.
 *
 * Nothing here reads a notification "read" flag, because there is no such thing
 * to read. Unread is derived from the same per-channel cursors the badges use, so
 * a room the reader has caught up on cannot still be shouting from here.
 */

import { normalizePubkey } from "@/features/profile/profile-model";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";
import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";

/** Both message kinds: 40002 exists in stored history and from other producers. */
const MESSAGE_KINDS = [KIND_STREAM_MESSAGE, KIND_STREAM_MESSAGE_V2];

/** How many of the reader's own messages are watched for replies. */
export const OWN_MESSAGE_WINDOW = 100;

export type NotificationCategory = "mention" | "dm" | "reply";

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  authorPubkey: string;
  channelId: string | null;
  createdAt: number;
  content: string;
}

/**
 * Messages naming the reader — mentions, and DMs.
 *
 * `#p` rather than a scan of every channel: the relay indexes it, and a client
 * that filtered locally would have to subscribe to the whole community.
 */
export function buildMentionFilter(pubkey: string, limit = 50): NostrFilter {
  return { kinds: MESSAGE_KINDS, "#p": [normalizePubkey(pubkey)], limit };
}

/**
 * Messages in the reader's DM channels, or `null` when they have none.
 *
 * Scoped by `#h` because that is where a DM's identity lives — the `p` tags that
 * say who is in it are on the channel metadata, and its messages carry only the
 * channel. Bounded by how many DMs the reader has, which is a small number.
 */
export function buildDmMessagesFilter(
  dmChannelIds: string[],
  limit = 50,
): NostrFilter | null {
  const ids = [...new Set(dmChannelIds)].filter(Boolean);
  if (ids.length === 0) return null;
  return { kinds: MESSAGE_KINDS, "#h": ids, limit };
}

/** The reader's own recent messages, which is where reply-watching starts. */
export function buildOwnMessagesFilter(
  pubkey: string,
  limit = OWN_MESSAGE_WINDOW,
): NostrFilter {
  return { kinds: MESSAGE_KINDS, authors: [normalizePubkey(pubkey)], limit };
}

/**
 * Replies to the given messages, or `null` when there are none to watch.
 *
 * `null` rather than an empty `#e`, which a relay is free to read as "any event"
 * — a filter that accidentally matched the whole community would turn a
 * notification list into a firehose.
 */
export function buildRepliesFilter(
  ownMessageIds: string[],
  limit = 50,
): NostrFilter | null {
  const ids = [...new Set(ownMessageIds)].filter(Boolean);
  if (ids.length === 0) return null;
  return { kinds: MESSAGE_KINDS, "#e": ids, limit };
}

function tagValue(event: NostrEvent, name: string): string | null {
  return event.tags.find((tag) => tag[0] === name)?.[1] ?? null;
}

function namesPubkey(event: NostrEvent, pubkey: string): boolean {
  return event.tags.some(
    (tag) => tag[0] === "p" && normalizePubkey(tag[1] ?? "") === pubkey,
  );
}

function referencesEvent(event: NostrEvent, ids: ReadonlySet<string>): boolean {
  return event.tags.some((tag) => tag[0] === "e" && ids.has(tag[1] ?? ""));
}

/**
 * Turn delivered events into notification rows.
 *
 * A DM outranks a mention when both apply, because "someone messaged you
 * directly" is the more useful of the two labels — and being mentioned inside a
 * DM you are already in is not news.
 *
 * The reader's own messages are dropped. Sending is not being notified, and a
 * `p` tag naming yourself is easy to produce by accident.
 */
export function buildNotifications({
  events,
  dmChannelIds,
  mutedPubkeys,
  myPubkey,
  ownMessageIds,
}: {
  events: NostrEvent[];
  /** Channels the reader knows to be DMs, from the channel list. */
  dmChannelIds: ReadonlySet<string>;
  /** Authors the reader has muted; a mute silences notifications too. */
  mutedPubkeys?: ReadonlySet<string>;
  myPubkey: string | null;
  /** The reader's own message ids, for recognizing a reply. */
  ownMessageIds: ReadonlySet<string>;
}): NotificationItem[] {
  if (!myPubkey) return [];
  const me = normalizePubkey(myPubkey);
  const muted: ReadonlySet<string> = mutedPubkeys ?? new Set<string>();
  const byId = new Map<string, NotificationItem>();

  for (const event of events) {
    if (!MESSAGE_KINDS.includes(event.kind)) continue;
    const author = normalizePubkey(event.pubkey);
    if (author === me) continue;
    // A mute is the reader saying they do not want to hear from someone. A
    // notification that still fired would make the mute worse than useless.
    if (muted.has(author)) continue;

    const channelId = tagValue(event, "h");
    const isDm = channelId !== null && dmChannelIds.has(channelId);
    const mentioned = namesPubkey(event, me);
    const isReply = referencesEvent(event, ownMessageIds);
    if (!isDm && !mentioned && !isReply) continue;

    const category: NotificationCategory = isDm
      ? "dm"
      : mentioned
        ? "mention"
        : "reply";

    // Keyed by id: the three filters overlap by design, so the same event
    // arrives more than once.
    byId.set(event.id, {
      id: event.id,
      category,
      authorPubkey: author,
      channelId,
      createdAt: event.created_at,
      content: event.content,
    });
  }

  return [...byId.values()].sort(
    (left, right) =>
      right.createdAt - left.createdAt || left.id.localeCompare(right.id),
  );
}

/**
 * Whether a notification is still unread.
 *
 * Measured against the channel cursor, not a flag of its own. Reading the room is
 * what clears it — anything else would leave the reader dismissing the same
 * mention twice, once in the room and once here.
 */
export function isNotificationUnread(
  item: NotificationItem,
  contexts: Record<string, number>,
): boolean {
  if (item.channelId === null) return true;
  const cursor = contexts[item.channelId];
  return cursor === undefined || item.createdAt > cursor;
}

export function unreadNotificationCount(
  items: NotificationItem[],
  contexts: Record<string, number>,
): number {
  return items.filter((item) => isNotificationUnread(item, contexts)).length;
}

const BODY_MAX_LENGTH = 140;

/**
 * Shorten a message for a notification body.
 *
 * Truncated on a character count rather than a word boundary: the content is
 * Markdown in any language, and Japanese has no spaces to break on.
 */
export function truncateBody(content: string, fallback = ""): string {
  const trimmed = content.trim();
  if (!trimmed) return fallback;
  if (trimmed.length <= BODY_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, BODY_MAX_LENGTH)}…`;
}

/**
 * The one-line title of a notification.
 *
 * Says who and where, because that is what decides whether the reader opens it.
 * A channel name is included only when there is one — a DM has no useful room
 * label, and "#" in front of a person's name reads as a channel that does not
 * exist.
 */
export function notificationTitle(
  item: NotificationItem,
  { authorLabel, channelName }: { authorLabel: string; channelName?: string },
): string {
  if (item.category === "dm") return `${authorLabel} からのDM`;
  const room = channelName ? `#${channelName}` : null;
  if (item.category === "mention") {
    return room
      ? `${authorLabel} が ${room} であなたに言及`
      : `${authorLabel} があなたに言及`;
  }
  return room
    ? `${authorLabel} が ${room} で返信`
    : `${authorLabel} が返信しました`;
}

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  mention: "メンション",
  dm: "DM",
  reply: "返信",
};
