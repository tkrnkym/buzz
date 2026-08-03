import type { ReactionSummary } from "@/features/chat/timeline";
import { cn } from "@/shared/lib/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

const PILL_BASE =
  "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-2xs font-medium leading-none transition-colors";

/**
 * The reaction pills under a message, ported from the desktop client.
 *
 * A pill is a toggle: clicking one the reader already gave withdraws it. The
 * `myReactionId` needed to withdraw comes from the derived row, so this never
 * has to query the relay to find the event it is about to delete.
 */
export function MessageReactions({
  disabled,
  onToggle,
  reactions,
}: {
  disabled?: boolean;
  onToggle: (input: { emoji: string; myReactionId?: string }) => void;
  reactions: ReactionSummary[];
}) {
  if (reactions.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => (
        <Tooltip key={reaction.emoji}>
          <TooltipTrigger asChild>
            <button
              aria-label={`${reaction.emoji} ${reaction.count}`}
              aria-pressed={reaction.mine}
              className={cn(
                PILL_BASE,
                reaction.mine
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary text-secondary-foreground hover:bg-accent",
              )}
              data-testid={`reaction-${reaction.emoji}`}
              disabled={disabled}
              onClick={() =>
                onToggle({
                  emoji: reaction.emoji,
                  myReactionId: reaction.myReactionId,
                })
              }
              type="button"
            >
              {reaction.emojiUrl ? (
                <img
                  alt={reaction.emoji}
                  className="size-3.5 object-contain"
                  draggable={false}
                  src={reaction.emojiUrl}
                />
              ) : (
                <span>{reaction.emoji}</span>
              )}
              <span className="tabular-nums text-muted-foreground">
                {reaction.count}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {reaction.mine ? "Click to remove" : `React with ${reaction.emoji}`}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
