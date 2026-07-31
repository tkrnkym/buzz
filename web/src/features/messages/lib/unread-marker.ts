/**
 * Where the "New" line goes, ported from the desktop client.
 *
 * The subtlety worth keeping: "unread" is measured against the frontier as it
 * stood **when the channel was opened**, not against the live read cursor.
 * Opening a channel immediately advances the live cursor to the newest message,
 * so a divider computed from it would always land at the bottom and never mark
 * anything. See `ChatPage`'s mark-read effect for the advance this has to
 * outrun.
 */

import type { TimelineRow } from "@/features/chat/timeline";

export interface ChannelUnreadMarker {
  /** Oldest unread top-level message, or `null` when nothing is unread. */
  firstUnreadMessageId: string | null;
  /** How many top-level messages are unread from that point on. */
  unreadCount: number;
}

const EMPTY: ChannelUnreadMarker = {
  firstUnreadMessageId: null,
  unreadCount: 0,
};

/**
 * @param rows Loaded rows, chronological.
 * @param frontierSeconds Read position captured at channel open. `null` means
 *   the channel was never read, so everything counts as unread.
 * @param currentPubkey The reader, whose own messages never count as unread.
 */
export function computeChannelUnreadMarker(
  rows: TimelineRow[],
  frontierSeconds: number | null,
  currentPubkey?: string | null,
): ChannelUnreadMarker {
  // Normalized once: a case mismatch between two spellings of the reader's key
  // would count their own posts as unread.
  const self = currentPubkey?.toLowerCase();

  let firstUnreadMessageId: string | null = null;
  let unreadCount = 0;

  for (const row of rows) {
    // Replies are out of scope: the channel divider marks top-level messages,
    // and a thread's own unread state belongs to the thread panel.
    if (row.message.parentId !== null) continue;
    if (row.message.system) continue;
    if (self && row.message.pubkey.toLowerCase() === self) continue;

    const isUnread =
      frontierSeconds === null || row.message.createdAt > frontierSeconds;
    if (!isUnread) continue;

    if (firstUnreadMessageId === null) {
      firstUnreadMessageId = row.message.id;
    }
    unreadCount += 1;
  }

  return firstUnreadMessageId === null
    ? EMPTY
    : { firstUnreadMessageId, unreadCount };
}
