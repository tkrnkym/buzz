import { useEffect, useLayoutEffect, useRef } from "react";

import type { TimelineRow } from "@/features/chat/timeline";
import { MessageContent } from "@/features/chat/ui/MessageContent";
import { ReactionBar } from "@/features/chat/ui/ReactionBar";
import { cn } from "@/shared/lib/cn";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { relativeTime } from "@/shared/lib/relative-time";

/**
 * Render a system row's payload.
 *
 * Relay-authored rows carry a JSON body (`{"type":"channel_auto_archived"}`).
 * Show the type when it parses, and fall back to the raw content rather than
 * rendering an empty row for a shape this client does not know yet.
 */
function systemMessageLabel(content: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === "object" && "type" in parsed) {
      const type = (parsed as { type?: unknown }).type;
      if (typeof type === "string") {
        return type.split("_").join(" ");
      }
    }
  } catch {
    // Not JSON — fall through to the raw content.
  }
  return content;
}

export interface TimelineActions {
  /** Presence for an author, or null when unknown. */
  statusOf: (pubkey: string) => string | null;
  onToggleReaction: (input: {
    messageId: string;
    emoji: string;
    myReactionId?: string;
  }) => void;
  onReply: (row: TimelineRow) => void;
  pending?: boolean;
}

/**
 * Presence marker beside an author.
 *
 * Unknown presence renders nothing rather than a grey dot: the relay only knows
 * who is currently connected, so "no status" means "not established", not
 * "offline", and showing them as away would be a claim the client cannot make.
 */
function PresenceDot({ status }: { status: string | null }) {
  if (status === null || status === "offline") return null;
  return (
    <>
      {/* The dot is decoration; the status is announced as text so a screen
          reader hears it rather than skipping a bare span. */}
      <span className="sr-only">{`Status: ${status}`}</span>
      <span
        aria-hidden
        title={status}
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          status === "online" ? "bg-primary" : "bg-muted-foreground",
        )}
      />
    </>
  );
}

function MessageRow({
  row,
  actions,
}: {
  row: TimelineRow;
  actions: TimelineActions;
}) {
  const { message } = row;

  if (message.system) {
    return (
      <li className="px-4 py-1 text-2xs italic text-muted-foreground">
        {systemMessageLabel(row.content)}
      </li>
    );
  }

  if (row.deleted) {
    // A tombstone is shown rather than the row vanishing: a reader following a
    // reply needs to see that the parent existed and was removed.
    return (
      <li className="px-4 py-1.5 text-sm italic text-muted-foreground">
        Message deleted
        {row.deletedReason ? ` — ${row.deletedReason}` : ""}
      </li>
    );
  }

  return (
    <li className="group px-4 py-1.5">
      <div className="flex items-baseline gap-2">
        <PresenceDot status={actions.statusOf(message.pubkey)} />
        <span className="font-semibold text-base">
          {truncatePubkey(message.pubkey)}
        </span>
        <time
          className="text-2xs text-muted-foreground"
          dateTime={new Date(message.createdAt * 1000).toISOString()}
        >
          {relativeTime(message.createdAt)}
        </time>
        {row.edited && (
          <span className="text-2xs text-muted-foreground">(edited)</span>
        )}
        <button
          type="button"
          onClick={() => actions.onReply(row)}
          className="text-2xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          Reply
        </button>
      </div>

      <div className="break-words">
        <MessageContent content={row.content} imeta={message.imeta} />
      </div>

      {row.replyCount > 0 && (
        <p className="text-2xs text-primary">
          {row.replyCount === 1 ? "1 reply" : `${row.replyCount} replies`}
        </p>
      )}

      <ReactionBar
        reactions={row.reactions}
        disabled={actions.pending}
        onToggle={({ emoji, myReactionId }) =>
          actions.onToggleReaction({
            messageId: message.id,
            emoji,
            myReactionId,
          })
        }
      />
    </li>
  );
}

export function MessageTimeline({
  rows,
  loaded,
  error,
  actions,
  hasMore = false,
  isLoadingMore = false,
  onLoadOlder,
}: {
  rows: TimelineRow[];
  loaded: boolean;
  error: string | null;
  actions: TimelineActions;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadOlder?: () => void;
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
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      {onLoadOlder && (
        <div className="flex justify-center py-2">
          {hasMore ? (
            <button
              type="button"
              onClick={loadOlder}
              disabled={isLoadingMore}
              className="rounded-md px-3 py-1 text-2xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
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
      <ul className="flex flex-col py-2">
        {rows.map((row) => (
          <MessageRow key={row.message.id} row={row} actions={actions} />
        ))}
      </ul>
      <div ref={bottomRef} />
    </div>
  );
}
