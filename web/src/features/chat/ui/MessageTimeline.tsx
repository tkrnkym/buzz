import { useEffect, useRef } from "react";

import type { Message } from "@/features/chat/chat-model";
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

function MessageRow({ message }: { message: Message }) {
  if (message.system) {
    return (
      <li className="px-4 py-1 text-2xs italic text-muted-foreground">
        {systemMessageLabel(message.content)}
      </li>
    );
  }

  return (
    <li className="px-4 py-1.5">
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
        {message.parentId && (
          <span className="text-2xs text-muted-foreground">reply</span>
        )}
      </div>
      {/* `text-base` is the app's chat body size; whitespace-pre-wrap preserves
          the author's line breaks until markdown rendering is ported. */}
      <p className="whitespace-pre-wrap break-words text-base">
        {message.content}
      </p>
    </li>
  );
}

export function MessageTimeline({
  messages,
  loaded,
  error,
}: {
  messages: Message[];
  loaded: boolean;
  error: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Follow the tail. Virtualization and read-position restore are later work;
  // this keeps the newest message visible in the meantime. Keyed on the count so
  // an edit to an existing message does not yank the viewport.
  const messageCount = messages.length;
  useEffect(() => {
    if (messageCount === 0) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messageCount]);

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

  if (messages.length === 0) {
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
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
      </ul>
      <div ref={bottomRef} />
    </div>
  );
}
