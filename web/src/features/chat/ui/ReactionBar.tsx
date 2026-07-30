import type { ReactionSummary } from "@/features/chat/timeline";
import { cn } from "@/shared/lib/cn";

/**
 * Emoji offered for one-click reaction.
 *
 * A fixed set until a picker is ported; any emoji already on a message can still
 * be toggled from its pill.
 */
export const QUICK_REACTIONS = ["👍", "🎉", "✅", "👀", "❤️"];

export function ReactionBar({
  reactions,
  onToggle,
  disabled,
}: {
  reactions: ReactionSummary[];
  onToggle: (input: { emoji: string; myReactionId?: string }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          disabled={disabled}
          onClick={() =>
            onToggle({
              emoji: reaction.emoji,
              myReactionId: reaction.myReactionId,
            })
          }
          aria-pressed={reaction.mine}
          aria-label={`${reaction.emoji} ${reaction.count}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-2xs transition-colors",
            reaction.mine
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-secondary text-secondary-foreground hover:bg-accent",
          )}
        >
          {reaction.emojiUrl ? (
            <img
              src={reaction.emojiUrl}
              alt={reaction.emoji}
              className="size-3.5"
            />
          ) : (
            <span>{reaction.emoji}</span>
          )}
          <span className="tabular-nums">{reaction.count}</span>
        </button>
      ))}

      {/* Revealed on row hover or keyboard focus, so the timeline stays quiet
          while reading but the affordance is reachable without a pointer. */}
      <span className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {QUICK_REACTIONS.filter(
          (emoji) => !reactions.some((reaction) => reaction.emoji === emoji),
        ).map((emoji) => (
          <button
            key={emoji}
            type="button"
            disabled={disabled}
            onClick={() => onToggle({ emoji })}
            aria-label={`React with ${emoji}`}
            className="rounded-full border border-transparent px-1.5 py-0.5 text-2xs hover:border-border hover:bg-accent"
          >
            {emoji}
          </button>
        ))}
      </span>
    </div>
  );
}
