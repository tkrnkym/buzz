import { Info } from "lucide-react";

import type { TimelineRow } from "@/features/chat/timeline";
import { MessageTimestamp } from "@/features/messages/ui/MessageTimestamp";
import { truncatePubkey } from "@/shared/lib/pubkey";

interface SystemPayload {
  type: string;
  actor?: string;
  target?: string;
  topic?: string;
  public_reason?: string;
}

function parsePayload(content: string): SystemPayload | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { type?: unknown }).type === "string"
    ) {
      return parsed as SystemPayload;
    }
  } catch {
    // Not JSON — the caller falls back to the raw content.
  }
  return null;
}

/**
 * Turn a relay-authored payload into a sentence.
 *
 * Unknown types fall back to the underscored type name rather than being
 * dropped: a relay that grows a new notice should show something a reader can
 * act on, not an empty row. A payload that is not JSON at all falls back to its
 * raw content for the same reason.
 */
function describe(row: TimelineRow): string {
  const payload = parsePayload(row.content);
  if (!payload) return row.content;

  const actor = payload.actor ? truncatePubkey(payload.actor) : null;
  const target = payload.target ? truncatePubkey(payload.target) : null;

  switch (payload.type) {
    case "member_joined":
      return actor && target && actor !== target
        ? `${actor} added ${target}`
        : `${target ?? "Someone"} joined`;
    case "member_left":
      return `${target ?? "Someone"} left`;
    case "member_removed":
      return actor && target
        ? `${actor} removed ${target}`
        : `${target ?? "Someone"} was removed`;
    case "topic_changed":
      return payload.topic
        ? `${actor ?? "Someone"} set the topic to “${payload.topic}”`
        : `${actor ?? "Someone"} cleared the topic`;
    case "message_deleted":
      return payload.public_reason
        ? `A message was removed — ${payload.public_reason}`
        : "A message was removed";
    case "channel_auto_archived":
      return "This channel was archived automatically";
    default:
      return payload.type.split("_").join(" ");
  }
}

/**
 * Consecutive relay notices as one block, ported from the desktop client.
 *
 * Grouping matters here more than it looks: a community import or a bulk invite
 * produces a run of join notices, and one line each would push the actual
 * conversation off the screen. The grouping window is enforced in
 * `timeline-items.ts`.
 */
export function SystemMessageGroup({ rows }: { rows: TimelineRow[] }) {
  return (
    <li className="flex gap-2 px-4 py-1" data-testid="system-message-group">
      <span className="flex w-9 shrink-0 justify-center pt-0.5 text-muted-foreground/60">
        <Info aria-hidden className="size-3.5" />
      </span>
      <ul className="min-w-0 flex-1">
        {rows.map((row) => (
          <li
            className="flex items-baseline gap-2 text-2xs text-muted-foreground"
            key={row.message.id}
          >
            <span className="min-w-0 flex-1 truncate">{describe(row)}</span>
            <MessageTimestamp createdAt={row.message.createdAt} hideDayPeriod />
          </li>
        ))}
      </ul>
    </li>
  );
}
