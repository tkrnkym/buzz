import { useEffect, useRef } from "react";

import type { TimelineRow } from "@/features/chat/timeline";
import { MessageContent } from "@/features/chat/ui/MessageContent";
import { ReactionBar } from "@/features/chat/ui/ReactionBar";
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
  onToggleReaction: (input: {
    messageId: string;
    emoji: string;
    myReactionId?: string;
  }) => void;
  onReply: (row: TimelineRow) => void;
  pending?: boolean;
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
}: {
  rows: TimelineRow[];
  loaded: boolean;
  error: string | null;
  actions: TimelineActions;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Follow the tail. Virtualization and read-position restore are later work;
  // this keeps the newest message visible in the meantime. Keyed on the count so
  // a reaction or edit does not yank the viewport.
  const rowCount = rows.length;
  useEffect(() => {
    if (rowCount === 0) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [rowCount]);

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
    <div className="flex-1 overflow-y-auto">
      <ul className="flex flex-col py-2">
        {rows.map((row) => (
          <MessageRow key={row.message.id} row={row} actions={actions} />
        ))}
      </ul>
      <div ref={bottomRef} />
    </div>
  );
}
