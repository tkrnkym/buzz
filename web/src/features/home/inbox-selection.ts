/**
 * What the Inbox is showing on the right.
 *
 * The Inbox was one scrolling column, and every row was a link out of it:
 * reading one mention meant landing at a message in a busy channel and losing
 * the list. Triage is the thing an inbox is for, and triage needs to read
 * without leaving — so the list keeps its place and a second pane shows the
 * selected item.
 *
 * The two row kinds stay distinguishable rather than being flattened into one
 * union of "items": a notification is a message that named the reader, and a room
 * row is the relay's word that a channel moved with no claim about who said what
 * (see `inbox.ts`). They resolve to different detail panes, and pretending
 * otherwise would mean inventing an author for a room.
 */

export type InboxSelection =
  | { kind: "notification"; id: string }
  | { kind: "room"; channelId: string };

export function sameSelection(
  left: InboxSelection | null,
  right: InboxSelection | null,
): boolean {
  if (left === null || right === null) return left === right;
  if (left.kind === "notification" && right.kind === "notification") {
    return left.id === right.id;
  }
  if (left.kind === "room" && right.kind === "room") {
    return left.channelId === right.channelId;
  }
  return false;
}

/**
 * The selection to show, given what is actually in the list.
 *
 * Derived on every render rather than corrected by an effect. The list is live —
 * a mention arrives, a room is read elsewhere and drops off — so a stored
 * selection can name something that is gone, and an effect that fixes it up
 * afterwards renders one frame of a detail pane for a row that no longer exists.
 *
 * A notification is preferred as the default because a message with the reader's
 * name on it is the more urgent of the two, which is the same reason it is the
 * first group in the list.
 */
export function resolveSelection({
  current,
  notificationIds,
  roomIds,
}: {
  current: InboxSelection | null;
  notificationIds: string[];
  roomIds: string[];
}): InboxSelection | null {
  if (
    current?.kind === "notification" &&
    notificationIds.includes(current.id)
  ) {
    return current;
  }
  if (current?.kind === "room" && roomIds.includes(current.channelId)) {
    return current;
  }
  const [firstNotification] = notificationIds;
  if (firstNotification !== undefined) {
    return { kind: "notification", id: firstNotification };
  }
  const [firstRoom] = roomIds;
  return firstRoom === undefined
    ? null
    : { kind: "room", channelId: firstRoom };
}

/**
 * The messages around one, so a mention is read in its conversation.
 *
 * The point of the pane: a mention on its own is often unreadable — "それで
 * いいと思います" answers a question that is one row above it. A window rather
 * than the whole channel, because the pane is a preview and the channel is where
 * the reader goes when the preview is not enough.
 *
 * A message that is not in the loaded window yields nothing rather than the first
 * few messages of the room, which would look like context and be unrelated.
 */
export function neighbourhood<T>(
  items: T[],
  idOf: (item: T) => string,
  id: string,
  radius: number,
): T[] {
  const index = items.findIndex((item) => idOf(item) === id);
  if (index === -1) return [];
  return items.slice(Math.max(0, index - radius), index + radius + 1);
}
