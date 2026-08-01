/**
 * Flattens timeline rows into the stream the list renders one row per entry.
 *
 * Ported from the desktop client's `timelineItems`. Pure, because this is where
 * every visible structural rule lives — which messages group, where the day
 * breaks, where the unread line sits — and those rules are much easier to be
 * sure of as data than as JSX.
 *
 * Three rules interact and the order matters:
 *
 * 1. Only top-level messages appear. Replies are reached through the thread
 *    panel, so one busy thread cannot bury a channel.
 * 2. A divider — day or unread — **breaks grouping**. A continuation rendered
 *    directly under a divider would have no visible author.
 * 3. Consecutive system rows collapse into one group, so a burst of joins is a
 *    single line rather than ten.
 */

import type { TimelineRow } from "@/features/chat/timeline";
import {
  hasSameMessageAuthor,
  isWithinGroupingWindow,
} from "@/features/messages/lib/message-grouping";
import { startOfLocalDaySeconds } from "@/features/messages/lib/date-formatters";

/** How far apart consecutive system rows may be and still collapse. */
export const SYSTEM_GROUP_WINDOW_SECONDS = 5 * 60;

export type TimelineItem =
  /**
   * Carries the timestamp rather than a prebaked label so the render resolves
   * "Today" against the current clock — a tab left open overnight would
   * otherwise keep calling yesterday "Today".
   */
  | { kind: "day-divider"; key: string; headingTimestamp: number }
  | { kind: "unread-divider"; key: string }
  | { kind: "system-group"; key: string; rows: TimelineRow[] }
  | {
      kind: "message";
      key: string;
      row: TimelineRow;
      /** Renders without avatar or header, under the message above it. */
      isContinuation: boolean;
      /** Something groups below this one, so its own spacing tightens. */
      isFollowedByContinuation: boolean;
    };

/**
 * @param rows Every loaded row, chronological. Replies are filtered out here.
 * @param firstUnreadMessageId Where the unread line goes, or `null` for none.
 */
export function buildTimelineItems({
  rows,
  firstUnreadMessageId = null,
}: {
  rows: TimelineRow[];
  firstUnreadMessageId?: string | null;
}): TimelineItem[] {
  const topLevel = rows.filter((row) => row.message.parentId === null);
  const items: TimelineItem[] = [];

  let previousDayKey: number | null = null;
  /** The last message emitted, or null when a divider or system row intervened. */
  let previousMessage: TimelineRow | null = null;

  for (const row of topLevel) {
    const dayKey = startOfLocalDaySeconds(row.message.createdAt);
    if (dayKey !== previousDayKey) {
      items.push({
        kind: "day-divider",
        key: `day-${dayKey}`,
        headingTimestamp: row.message.createdAt,
      });
      previousDayKey = dayKey;
      // Rule 2: nothing may group across the divider.
      previousMessage = null;
    }

    if (row.message.id === firstUnreadMessageId) {
      items.push({ kind: "unread-divider", key: `unread-${row.message.id}` });
      previousMessage = null;
    }

    if (row.message.system) {
      const last = items[items.length - 1];
      const canExtend =
        last?.kind === "system-group" &&
        row.message.createdAt -
          last.rows[last.rows.length - 1].message.createdAt <=
          SYSTEM_GROUP_WINDOW_SECONDS;
      if (canExtend && last.kind === "system-group") {
        last.rows.push(row);
      } else {
        items.push({
          kind: "system-group",
          // Keyed on the group's first row: extending a group changes its
          // contents but must not change its identity, or the list remounts it.
          key: `system-${row.message.id}`,
          rows: [row],
        });
      }
      previousMessage = null;
      continue;
    }

    const isContinuation =
      previousMessage !== null &&
      // A tombstone has no author line of its own to continue from.
      !row.deleted &&
      !previousMessage.deleted &&
      hasSameMessageAuthor(previousMessage.message, row.message) &&
      isWithinGroupingWindow(
        previousMessage.message.createdAt,
        row.message.createdAt,
      );

    items.push({
      kind: "message",
      key: row.message.id,
      row,
      isContinuation,
      isFollowedByContinuation: false,
    });
    previousMessage = row;
  }

  // Back-fill the "followed by" flag now that the neighbours are known. Done in
  // a second pass rather than by look-ahead because whether the *next* row
  // groups depends on the dividers emitted between them, which are only settled
  // once the first pass is complete.
  for (let index = 0; index < items.length - 1; index++) {
    const current = items[index];
    const next = items[index + 1];
    if (
      current.kind === "message" &&
      next.kind === "message" &&
      next.isContinuation
    ) {
      current.isFollowedByContinuation = true;
    }
  }

  return items;
}

/** One day's worth of the stream: its divider, and everything under it. */
export interface TimelineDayGroup {
  key: string;
  headingTimestamp: number;
  items: Exclude<TimelineItem, { kind: "day-divider" }>[];
}

/**
 * Fold the flat stream into day groups.
 *
 * Purely so the day heading can be `position: sticky` *within its own day*.
 * Flat siblings all stick at the same offset, so a second day's heading pins on
 * top of the first instead of pushing it away, and a reader scrolling through
 * history sees a growing stack of dates. Scoping each heading to a container
 * that ends where its day ends is what makes it scroll off.
 *
 * Anything before the first divider is impossible — the builder always emits one
 * ahead of the first row — so a leading item without a day is dropped rather
 * than given an invented date.
 */
export function groupItemsByDay(items: TimelineItem[]): TimelineDayGroup[] {
  const groups: TimelineDayGroup[] = [];
  for (const item of items) {
    if (item.kind === "day-divider") {
      groups.push({
        key: item.key,
        headingTimestamp: item.headingTimestamp,
        items: [],
      });
      continue;
    }
    groups[groups.length - 1]?.items.push(item);
  }
  return groups;
}
