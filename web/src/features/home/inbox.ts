/**
 * Inbox derivation, ported in spirit from the desktop client's `home/lib/inbox`.
 *
 * The desktop inbox listed individual messages — mentions, thread replies, DMs
 * — because it had the messages module to read them from. This client has the
 * relay's per-channel activity snapshots and the reader's own cursors, so the
 * inbox it can honestly build is room-level: which rooms moved since you last
 * read them, most recent first.
 *
 * Pure so the ordering rules are testable, and so the shape stays put when
 * message-level rows are added on top of it.
 */

import type { Channel } from "@/features/chat/chat-model";

export interface InboxRow {
  channel: Channel;
  /** Last observed activity, in seconds, or `null` when never observed. */
  lastActivityAt: number | null;
}

/**
 * Rooms with unread activity, newest first.
 *
 * A room whose activity time is unknown still appears — it was reported unread,
 * and dropping it would hide the very thing the inbox exists to surface — but it
 * sorts below every room with a known time, then alphabetically, so its position
 * does not jump around as snapshots arrive.
 */
export function buildInbox({
  channels,
  isUnread,
  lastActivityAt,
}: {
  channels: Channel[];
  isUnread: (channelId: string) => boolean;
  lastActivityAt: (channelId: string) => number | null;
}): InboxRow[] {
  return channels
    .filter((channel) => isUnread(channel.id))
    .map((channel) => ({
      channel,
      lastActivityAt: lastActivityAt(channel.id),
    }))
    .sort((left, right) => {
      if (left.lastActivityAt !== null && right.lastActivityAt !== null) {
        if (left.lastActivityAt !== right.lastActivityAt) {
          return right.lastActivityAt - left.lastActivityAt;
        }
      } else if (left.lastActivityAt !== null) {
        return -1;
      } else if (right.lastActivityAt !== null) {
        return 1;
      }
      return (
        left.channel.name.localeCompare(right.channel.name) ||
        left.channel.id.localeCompare(right.channel.id)
      );
    });
}
