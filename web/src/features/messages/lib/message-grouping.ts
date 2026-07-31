/**
 * When two consecutive messages render as one block.
 *
 * Ported from the desktop client. Grouping is what makes a timeline read as
 * conversation rather than as a log: a burst from one author shows their name
 * and avatar once, and each later line carries only a hover-revealed time.
 */

/**
 * Max gap, in seconds, between two same-author messages for the later one to
 * still render as a continuation.
 *
 * Beyond this the message reads as a new thought and gets the full avatar +
 * header treatment even from the same author. Ten minutes is the desktop
 * client's value, applied identically in the channel timeline and the thread
 * panel so a message does not regroup when it is opened in the other one.
 */
export const MESSAGE_GROUPING_WINDOW_SECONDS = 10 * 60;

export function hasSameMessageAuthor(
  previous: { pubkey?: string | null } | null | undefined,
  current: { pubkey?: string | null } | null | undefined,
): boolean {
  // Normalized because a case difference between two spellings of the same key
  // would split one author's burst into separate blocks.
  const previousPubkey = previous?.pubkey?.trim().toLowerCase();
  const currentPubkey = current?.pubkey?.trim().toLowerCase();
  return Boolean(
    previousPubkey && currentPubkey && previousPubkey === currentPubkey,
  );
}

/**
 * Whether `current` falls within the grouping window of `previous`.
 *
 * A negative gap is out of window: the pair is out of order, and grouping them
 * would show the later message under the earlier one's header.
 */
export function isWithinGroupingWindow(
  previousCreatedAt: number | null | undefined,
  currentCreatedAt: number | null | undefined,
): boolean {
  if (
    typeof previousCreatedAt !== "number" ||
    typeof currentCreatedAt !== "number"
  ) {
    return false;
  }
  const gap = currentCreatedAt - previousCreatedAt;
  return gap >= 0 && gap <= MESSAGE_GROUPING_WINDOW_SECONDS;
}
