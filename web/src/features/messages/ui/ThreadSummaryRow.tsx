import { ChevronRight } from "lucide-react";

import { formatThreadSummaryLastReplyTime } from "@/features/messages/lib/date-formatters";
import type { ThreadSummary } from "@/features/messages/lib/thread-summary";
import {
  resolveAvatarUrl,
  resolveUserLabel,
  type ProfileLookup,
} from "@/features/profile/profile-model";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

const MAX_AVATARS = 4;

/**
 * The "N replies" row under a thread root, ported from the desktop client.
 *
 * This row is what makes moving replies out of the timeline honest: the channel
 * stays readable, and the thread is still visibly there with who is in it and
 * when it last moved. Without it a busy thread would simply disappear.
 */
export function ThreadSummaryRow({
  onOpenThread,
  profiles,
  summary,
}: {
  onOpenThread: () => void;
  profiles: ProfileLookup;
  summary: ThreadSummary;
}) {
  const replyLabel = summary.replyCount === 1 ? "reply" : "replies";
  const lastReply = formatThreadSummaryLastReplyTime(summary.lastReplyAt);
  const shown = summary.participantPubkeys.slice(0, MAX_AVATARS);
  const overflow = summary.participantPubkeys.length - shown.length;

  return (
    <button
      aria-label={`View thread with ${summary.replyCount} ${replyLabel}, last reply ${lastReply}`}
      className="group/thread mt-1 flex w-fit max-w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent/60"
      data-testid={`thread-summary-${summary.rootId}`}
      onClick={onOpenThread}
      type="button"
    >
      <span aria-hidden className="flex shrink-0 items-center -space-x-1">
        {shown.map((pubkey) => (
          <PubkeyAvatar
            avatarUrl={resolveAvatarUrl(pubkey, profiles)}
            className="rounded-full ring-2 ring-background"
            key={pubkey}
            label={resolveUserLabel({
              pubkey,
              profiles,
              preferResolvedSelfLabel: true,
            })}
            pubkey={pubkey}
            size="sm"
          />
        ))}
      </span>
      <span className="text-2xs font-semibold text-primary">
        {summary.replyCount} {replyLabel}
        {overflow > 0 ? ` · +${overflow}` : ""}
      </span>
      <span className="truncate text-2xs text-muted-foreground">
        Last reply {lastReply}
      </span>
      {/* Appears on approach: the row is a link into the panel, and the arrow is
          what says so without adding noise to every root message. */}
      <ChevronRight
        aria-hidden
        className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/thread:opacity-100"
      />
    </button>
  );
}
