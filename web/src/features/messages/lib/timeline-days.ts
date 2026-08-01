/**
 * Which day each position in the flat timeline belongs to.
 *
 * Needed once the list is virtualized: the day heading can no longer be
 * `position: sticky` inside a day section, because the virtualizer positions
 * items itself. A floating pill shows the day instead, and to fill it the
 * timeline has to answer "what day is the item at the top of the viewport in"
 * from an index alone.
 */

import type { TimelineItem } from "@/features/messages/lib/timeline-items";

/**
 * The heading timestamp in effect at each index, aligned with `items`.
 *
 * `null` before the first divider, which the builder makes impossible in
 * practice — it always emits one ahead of the first row — but is the honest
 * answer for an item with no day above it rather than an invented date.
 */
export function dayTimestampsByIndex(items: TimelineItem[]): (number | null)[] {
  const days: (number | null)[] = new Array(items.length);
  let current: number | null = null;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item.kind === "day-divider") current = item.headingTimestamp;
    days[index] = current;
  }
  return days;
}

/**
 * The day to show in the floating pill for a given top-of-viewport index.
 *
 * Returns `null` while the first day's own divider is still on screen: a pill
 * repeating the label directly beneath it reads as a rendering bug rather than
 * as orientation.
 */
export function pillDayTimestamp(
  days: (number | null)[],
  topIndex: number,
): number | null {
  if (topIndex <= 0) return null;
  return days[Math.min(topIndex, days.length - 1)] ?? null;
}
