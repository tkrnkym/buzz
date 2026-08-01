import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type { TimelineRow } from "@/features/chat/timeline";
import { buildThreadSummaries } from "@/features/messages/lib/thread-summary";
import {
  buildTimelineItems,
  groupItemsByDay,
} from "@/features/messages/lib/timeline-items";
import { DayDivider } from "@/features/messages/ui/DayDivider";
import {
  MessageRow,
  type MessageRowActions,
} from "@/features/messages/ui/MessageRow";
import { SystemMessageGroup } from "@/features/messages/ui/SystemMessageGroup";
import { UnreadDivider } from "@/features/messages/ui/UnreadDivider";

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
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /**
   * Distance from the bottom, captured just before a prepend.
   *
   * Non-null means "a page of older history is on its way", which both scroll
   * effects read: one to restore the reader's position, the other to know not to
   * jump to the tail.
   */
  const prependAnchor = useRef<number | null>(null);

  const days = useMemo(
    () => groupItemsByDay(buildTimelineItems({ rows, firstUnreadMessageId })),
    [rows, firstUnreadMessageId],
  );
  const threadSummaries = useMemo(() => buildThreadSummaries(rows), [rows]);

  const rowCount = rows.length;
  const newestId = rowCount > 0 ? rows[rowCount - 1].message.id : null;
  const oldestId = rowCount > 0 ? rows[0].message.id : null;

  // Follow the tail. Keyed on the newest row's id rather than the row count:
  // a count also grows when older history is prepended, and scrolling to the
  // bottom then would throw the reader out of the history they just asked for.
  // A reaction or edit changes neither, so neither yanks the viewport.
  useEffect(() => {
    if (!newestId || prependAnchor.current !== null) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [newestId]);

  // Restore position after a prepend. Prepending rows pushes everything down by
  // the height of what arrived, which is not known in advance — but the distance
  // from the *bottom* is unchanged by a prepend, so restoring that puts the
  // reader back on the same row. Layout effect, so it lands before paint and the
  // jump is never visible.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    // `oldestId` is both the trigger and a guard: no rows means there is no
    // prepend to compensate for.
    if (!oldestId || !container || prependAnchor.current === null) return;
    container.scrollTop = container.scrollHeight - prependAnchor.current;
    prependAnchor.current = null;
  }, [oldestId]);

  const loadOlder = () => {
    const container = scrollRef.current;
    prependAnchor.current = container
      ? container.scrollHeight - container.scrollTop
      : null;
    onLoadOlder?.();
  };

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
    <div className="min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
      {onLoadOlder && (
        <div className="flex justify-center py-2">
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
      )}

      {/* One list per day, so the day heading can stick *inside* its own day.
          Flat siblings would all pin at the same offset and stack up. */}
      {days.map((day) => (
        <section key={day.key}>
          <DayDivider headingTimestamp={day.headingTimestamp} />
          <ul className="flex flex-col pb-2">
            {/* `if`-and-return rather than a switch: TypeScript narrows the
                union just as well, and every path visibly returns an element. */}
            {day.items.map((item) => {
              if (item.kind === "unread-divider") {
                return (
                  <UnreadDivider key={item.key} unreadCount={unreadCount} />
                );
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
          </ul>
        </section>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
