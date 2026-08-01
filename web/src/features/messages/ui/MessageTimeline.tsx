import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtualizer, type VirtualizerHandle } from "virtua";

import type { TimelineRow } from "@/features/chat/timeline";
import { buildThreadSummaries } from "@/features/messages/lib/thread-summary";
import {
  dayTimestampsByIndex,
  pillDayTimestamp,
} from "@/features/messages/lib/timeline-days";
import { buildTimelineItems } from "@/features/messages/lib/timeline-items";
import { DayDivider, DayPill } from "@/features/messages/ui/DayDivider";
import {
  MessageRow,
  type MessageRowActions,
} from "@/features/messages/ui/MessageRow";
import { SystemMessageGroup } from "@/features/messages/ui/SystemMessageGroup";
import { UnreadDivider } from "@/features/messages/ui/UnreadDivider";

/**
 * How much to render beyond the viewport, in pixels.
 *
 * Generous compared to the library default: a chat row is short, so 600px is
 * only a handful of them, and the cost of blank space during a fast scroll is
 * higher here than the cost of the extra nodes.
 */
const BUFFER_SIZE = 600;

/**
 * How close to the bottom still counts as "reading the live end", in pixels.
 *
 * Roughly one message tall. Inside it, a new message should scroll into view;
 * outside it the reader has deliberately scrolled away and moving them would
 * take the line they were reading off the screen.
 */
const STICK_TO_BOTTOM_SLACK = 80;

/**
 * The channel timeline, virtualized.
 *
 * Only what is near the viewport is in the DOM. That matters because scrollback
 * has no upper bound — a reader paging through history accumulates rows for as
 * long as they keep asking, and every one of them is a subtree with an avatar,
 * a markdown render, and a hover toolbar.
 *
 * Two behaviours the virtualizer owns that hand-rolled scrolling got wrong:
 *
 * - **Prepends.** `shift` keeps the scroll position measured from the end while
 *   items are added at the start, which is exactly what paging in older history
 *   needs. The previous code captured `scrollHeight - scrollTop` before the
 *   prepend and restored it in a layout effect; that worked, but only because
 *   every row was already measured.
 * - **The day heading.** It used to be `position: sticky` inside a per-day
 *   section. A sticky child of a transformed container sticks to nothing, so the
 *   heading now scrolls with its day and a floating pill reports which day the
 *   reader is in — which is also what it did on the way in.
 */
export function MessageTimeline({
  actions,
  error,
  firstUnreadMessageId = null,
  hasMore = false,
  isLoadingMore = false,
  loaded,
  onLoadOlder,
  rows,
  unreadCount = 0,
}: {
  actions: MessageRowActions;
  error: string | null;
  firstUnreadMessageId?: string | null;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loaded: boolean;
  onLoadOlder?: () => void;
  rows: TimelineRow[];
  unreadCount?: number;
}) {
  const virtualizer = useRef<VirtualizerHandle | null>(null);
  /**
   * True while a page of older history is on its way.
   *
   * Read by both scroll behaviours: it turns on `shift` so the prepend does not
   * move the reader, and it suppresses the jump to the tail that a growing item
   * count would otherwise trigger.
   */
  const prepending = useRef(false);
  /**
   * Whether the reader is at the live end.
   *
   * True to begin with, because opening a channel lands on the newest message.
   * A new message scrolls into view only while this holds — following the tail
   * unconditionally yanks someone out of the history they are reading, which is
   * what the previous timeline did.
   */
  const atBottom = useRef(true);
  const [topIndex, setTopIndex] = useState(0);

  const items = useMemo(
    () => buildTimelineItems({ rows, firstUnreadMessageId }),
    [rows, firstUnreadMessageId],
  );
  const threadSummaries = useMemo(() => buildThreadSummaries(rows), [rows]);
  const days = useMemo(() => dayTimestampsByIndex(items), [items]);

  const rowCount = rows.length;
  const newestId = rowCount > 0 ? rows[rowCount - 1].message.id : null;
  const itemCount = items.length;

  // Follow the tail. Keyed on the newest row's id rather than the item count:
  // a count also grows when older history is prepended, and scrolling to the
  // bottom then would throw the reader out of the history they just asked for.
  // A reaction or an edit changes neither, so neither yanks the viewport.
  useEffect(() => {
    if (itemCount === 0) return;
    if (prepending.current) {
      // The page has landed. `shift` already held the reader's position, so
      // this only has to stop claiming one is in flight.
      prepending.current = false;
      return;
    }
    if (!newestId || !atBottom.current) return;
    virtualizer.current?.scrollToIndex(itemCount - 1, { align: "end" });
  }, [newestId, itemCount]);

  const loadOlder = useCallback(() => {
    prepending.current = true;
    onLoadOlder?.();
  }, [onLoadOlder]);

  const onScroll = useCallback((offset: number) => {
    const handle = virtualizer.current;
    if (!handle) return;
    setTopIndex(handle.findItemIndex(offset));
    atBottom.current =
      offset + handle.viewportSize >= handle.scrollSize - STICK_TO_BOTTOM_SLACK;
  }, []);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="max-w-md text-center text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading messages…</p>
      </div>
    );
  }

  if (rowCount === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          No messages yet. Say something.
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <DayPill headingTimestamp={pillDayTimestamp(days, topIndex)} />
      <div className="h-full overflow-y-auto" data-testid="message-timeline">
        <Virtualizer
          // `ul`/`li` so the timeline keeps its list semantics: the virtualizer
          // owns the item wrapper, so the rows themselves cannot be `li`.
          as="ul"
          item="li"
          bufferSize={BUFFER_SIZE}
          onScroll={onScroll}
          ref={virtualizer}
          shift={prepending.current}
        >
          {onLoadOlder ? (
            <div className="flex justify-center py-2" key="older">
              {hasMore ? (
                <button
                  className="rounded-md px-3 py-1 text-2xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
                  disabled={isLoadingMore}
                  onClick={loadOlder}
                  type="button"
                >
                  {isLoadingMore ? "Loading…" : "Load older messages"}
                </button>
              ) : (
                <span className="px-3 py-1 text-2xs text-muted-foreground">
                  Beginning of the channel
                </span>
              )}
            </div>
          ) : (
            <div key="older" />
          )}
          {/* `if`-and-return rather than a switch: TypeScript narrows the union
              just as well, and every path visibly returns an element. */}
          {items.map((item) => {
            if (item.kind === "day-divider") {
              return (
                <DayDivider
                  headingTimestamp={item.headingTimestamp}
                  key={item.key}
                />
              );
            }
            if (item.kind === "unread-divider") {
              return <UnreadDivider key={item.key} unreadCount={unreadCount} />;
            }
            if (item.kind === "system-group") {
              return <SystemMessageGroup key={item.key} rows={item.rows} />;
            }
            return (
              <MessageRow
                actions={actions}
                isContinuation={item.isContinuation}
                isFollowedByContinuation={item.isFollowedByContinuation}
                key={item.key}
                row={item.row}
                threadSummary={threadSummaries.get(item.row.message.id)}
              />
            );
          })}
        </Virtualizer>
      </div>
    </div>
  );
}
