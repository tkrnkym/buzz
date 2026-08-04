import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Bot, Hash, StickyNote } from "lucide-react";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  CARD_CLASS,
  CARD_LABELS,
  cardKind,
  type PulseCardKind,
} from "@/features/pulse/pulse-model";
import {
  resolveAvatarUrl,
  resolveUserLabel,
} from "@/features/profile/profile-model";
import type { ProfileLookup } from "@/features/profile/profile-model";
import type { PulseEntry } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

/** Offered on every entry, so reacting is one click rather than a picker. */
const QUICK_REACTIONS = ["👍", "🎉", "👀"];

const KIND_ICON: Record<PulseCardKind, typeof Bot> = {
  note: StickyNote,
  "agent-report": Bot,
  "agent-failure": AlertTriangle,
};

/**
 * One Pulse entry.
 *
 * Which of the three cards it is — a note, an agent's report, or an agent that
 * stopped — is decided in `pulse-model.ts`. The distinction is the point: all
 * three used to render as the same bordered box with a 10px icon, so
 * "ハーネスの起動に失敗しました" sat in the same muted grey as a style
 * guideline and a stopped agent looked exactly like a memo.
 */
export function PulseCard({
  channelId,
  entry,
  nowSeconds,
  onToggleReaction,
  profiles,
}: {
  /** The channel this entry names, when the community has one by that name. */
  channelId: string | null;
  entry: PulseEntry;
  nowSeconds: number;
  /** Omitted when there is nothing to write to; the chips then only report. */
  onToggleReaction?: (emoji: string) => void;
  profiles: ProfileLookup;
}) {
  const kind = cardKind(entry);
  const Icon = KIND_ICON[kind];
  const label = resolveUserLabel({
    pubkey: entry.authorPubkey,
    profiles,
    preferResolvedSelfLabel: true,
  });

  return (
    <li
      className={cn("rounded-lg border px-4 py-3", CARD_CLASS[kind])}
      data-testid={`pulse-entry-${entry.id}`}
    >
      <div className="flex items-start gap-3">
        <PubkeyAvatar
          avatarUrl={resolveAvatarUrl(entry.authorPubkey, profiles)}
          label={label}
          pubkey={entry.authorPubkey}
          shape="circle"
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium">{entry.title}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-badge font-medium",
                kind === "agent-failure"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-secondary text-secondary-foreground",
              )}
              data-testid={`pulse-kind-${entry.id}`}
            >
              <Icon aria-hidden className="size-2.5" />
              {CARD_LABELS[kind]}
            </span>
            <span className="text-badge text-muted-foreground">{label}</span>
            {entry.channel && (
              <span className="inline-flex items-center gap-0.5 text-badge text-muted-foreground">
                <Hash aria-hidden className="size-2.5" />
                {entry.channel}
              </span>
            )}
            <span className="text-badge text-muted-foreground">
              {formatRelativeTime(entry.at, nowSeconds)}
            </span>
          </p>

          {/* A failure's body is the reason it stopped, which is the only thing
              the reader came for — so it is the card's own text rather than a
              muted aside under the title. */}
          <p
            className={cn(
              "mt-1 whitespace-pre-wrap",
              kind === "agent-failure"
                ? "text-2xs text-foreground"
                : "text-2xs text-muted-foreground",
            )}
          >
            {entry.body}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {entry.reactions.map((reaction) => (
              <button
                aria-label={`${reaction.emoji} ${reaction.count}`}
                aria-pressed={reaction.mine ?? false}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-2xs leading-none disabled:opacity-60",
                  // Same distinction the real timeline draws on its own
                  // reactions, so a chip says whether the next click joins
                  // or withdraws.
                  reaction.mine
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-secondary hover:bg-accent",
                )}
                data-testid={`pulse-reaction-${entry.id}-${reaction.emoji}`}
                disabled={onToggleReaction === undefined}
                key={reaction.emoji}
                onClick={() => onToggleReaction?.(reaction.emoji)}
                type="button"
              >
                {reaction.emoji}
                <span className="tabular-nums text-muted-foreground">
                  {reaction.count}
                </span>
              </button>
            ))}
            {onToggleReaction &&
              QUICK_REACTIONS.filter(
                (emoji) => !entry.reactions.some((row) => row.emoji === emoji),
              ).map((emoji) => (
                <button
                  aria-label={`${emoji} で反応する`}
                  className="inline-flex h-6 items-center rounded-full border border-dashed border-border px-2 text-2xs leading-none text-muted-foreground hover:bg-accent"
                  data-testid={`pulse-add-reaction-${entry.id}-${emoji}`}
                  key={emoji}
                  onClick={() => onToggleReaction(emoji)}
                  type="button"
                >
                  {emoji}
                </button>
              ))}

            {/* The way to the room it happened in. An entry naming `#dev` and
                offering no way to get there is the one question every reader has
                next, and it is worth most on the card that says something broke. */}
            {channelId !== null && (
              <Link
                className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-badge font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                data-testid={`pulse-open-channel-${entry.id}`}
                params={{ channelId }}
                to="/c/$channelId"
              >
                #{entry.channel} を開く
                <ArrowRight aria-hidden className="size-2.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
