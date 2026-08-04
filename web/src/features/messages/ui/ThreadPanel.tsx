import { X } from "lucide-react";
import { useMemo } from "react";

import type { TimelineRow } from "@/features/chat/timeline";
import { threadRows } from "@/features/messages/lib/thread-summary";
import { cn } from "@/shared/lib/cn";
import {
  hasSameMessageAuthor,
  isWithinGroupingWindow,
} from "@/features/messages/lib/message-grouping";
import {
  MessageRow,
  type MessageRowActions,
} from "@/features/messages/ui/MessageRow";

/**
 * The thread panel, ported from the desktop client.
 *
 * Replies live here rather than inline in the channel, which is the trade that
 * keeps a channel readable when one thread gets busy. The panel therefore has to
 * carry the root as well as the replies — without it the replies read as a
 * separate little channel with no subject.
 *
 * The desktop version drew nested depth guides for reply-to-reply chains. This
 * one is flat: the relay's thread model is a root plus descendants, and a flat
 * chronological list is the honest rendering of that until reply-to-reply
 * targeting exists in the composer.
 */
export function ThreadPanel({
  actions,
  onClose,
  rootId,
  rows,
  wide = false,
}: {
  actions: MessageRowActions;
  onClose: () => void;
  rootId: string;
  rows: TimelineRow[];
  /**
   * Fill the pane instead of sitting in a column beside it.
   *
   * Set by the `full` thread layout — see `thread-layout.ts`. A fixed 384px column
   * next to a hidden timeline would leave most of the window empty.
   */
  wide?: boolean;
}) {
  const thread = useMemo(() => threadRows(rows, rootId), [rows, rootId]);

  if (thread.length === 0) {
    // The root is not loaded — most likely it is older than the loaded window.
    return (
      <aside
        aria-label="Thread"
        className={cn(
          "flex flex-col bg-background shadow-panel-left",
          wide ? "min-w-0 flex-1" : "w-96 shrink-0",
        )}
        data-testid="thread-panel"
      >
        <ThreadHeader onClose={onClose} replyCount={0} />
        <p className="p-4 text-2xs text-muted-foreground">
          This thread’s first message is older than the loaded history. Load
          older messages to open it.
        </p>
      </aside>
    );
  }

  const [root, ...replies] = thread;

  return (
    <aside
      aria-label="Thread"
      className={cn(
        "flex flex-col bg-background shadow-panel-left",
        wide ? "min-w-0 flex-1" : "w-96 shrink-0",
      )}
      data-testid="thread-panel"
    >
      <ThreadHeader onClose={onClose} replyCount={replies.length} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* A plain container, not a list: `MessageRow` renders a `div` so the
            virtualized channel timeline can supply its own `li` wrapper. */}
        <div className="flex flex-col pb-2">
          {/* The root always gets the full treatment — it is the subject, and a
              grouped root would have no visible author. Its own thread summary
              is suppressed: the panel *is* the thread. */}
          <MessageRow
            actions={actions}
            isContinuation={false}
            isFollowedByContinuation={false}
            key={root.message.id}
            row={root}
          />
        </div>

        {replies.length > 0 && (
          <>
            <div
              aria-hidden
              className="mx-4 my-1 flex items-center gap-2 text-2xs text-muted-foreground"
            >
              <span className="h-px flex-1 bg-border" />
              {replies.length === 1 ? "1 reply" : `${replies.length} replies`}
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="flex flex-col pb-2">
              {replies.map((reply, index) => {
                const previous = index > 0 ? replies[index - 1] : null;
                // Same grouping rule as the channel, so a message does not
                // regroup when it is opened here.
                const isContinuation =
                  previous !== null &&
                  !reply.deleted &&
                  !previous.deleted &&
                  hasSameMessageAuthor(previous.message, reply.message) &&
                  isWithinGroupingWindow(
                    previous.message.createdAt,
                    reply.message.createdAt,
                  );
                const next = replies[index + 1];
                const isFollowedByContinuation =
                  next !== undefined &&
                  !reply.deleted &&
                  !next.deleted &&
                  hasSameMessageAuthor(reply.message, next.message) &&
                  isWithinGroupingWindow(
                    reply.message.createdAt,
                    next.message.createdAt,
                  );

                return (
                  <MessageRow
                    actions={actions}
                    isContinuation={isContinuation}
                    isFollowedByContinuation={isFollowedByContinuation}
                    key={reply.message.id}
                    row={reply}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function ThreadHeader({
  onClose,
  replyCount,
}: {
  onClose: () => void;
  replyCount: number;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">Thread</h2>
        <p className="text-2xs text-muted-foreground">
          {replyCount === 1 ? "1 reply" : `${replyCount} replies`}
        </p>
      </div>
      <button
        aria-label="Close thread"
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="close-thread"
        onClick={onClose}
        type="button"
      >
        <X aria-hidden className="size-4" />
      </button>
    </header>
  );
}
