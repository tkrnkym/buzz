import { Bot, Hash, StickyNote } from "lucide-react";
import { useMemo, useState } from "react";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  resolveAvatarUrl,
  resolveUserLabel,
} from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { togglePulseReaction } from "@/features/showcase/showcase-mutations";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import {
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import type { PulseTab } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

const TABS: { value: PulseTab; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "notes", label: "ノート" },
  { value: "agents", label: "エージェント" },
];

/**
 * Pulse: the community's feed of things worth keeping.
 *
 * Notes people wrote and reports agents filed, in one stream. They are kept
 * apart by a tab rather than a badge because the two are read for different
 * reasons — a note is something to remember, an agent report is something that
 * just happened — and mixing them by default buries the shorter list.
 */
/** Offered on every entry, so reacting is one click rather than a picker. */
const QUICK_REACTIONS = ["👍", "🎉", "👀"];

export function PulsePage() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const [tab, setTab] = useState<PulseTab>("all");
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);

  const entries = useMemo(() => {
    const all = showcase?.pulse ?? [];
    const filtered = tab === "all" ? all : all.filter((e) => e.tab === tab);
    return [...filtered].sort((left, right) => right.at - left.at);
  }, [showcase, tab]);
  const profiles = useProfiles(entries.map((entry) => entry.authorPubkey));

  if (!showcase) {
    return (
      <ShowcasePage
        subtitle="覚えておきたいことと、自動で届いたこと"
        title="Pulse"
      >
        <NotWiredUp what="Pulse" />
      </ShowcasePage>
    );
  }

  return (
    <ShowcasePage
      subtitle="覚えておきたいことと、自動で届いたこと"
      title="Pulse"
    >
      <div className="flex items-center gap-1" data-testid="pulse-tabs">
        {TABS.map((option) => (
          <button
            className={cn(
              "rounded-md px-2.5 py-1 text-2xs font-medium transition-colors",
              tab === option.value
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
            data-testid={`pulse-tab-${option.value}`}
            key={option.value}
            onClick={() => setTab(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <ul className="mt-4 flex flex-col gap-3" data-testid="pulse-list">
        {entries.map((entry) => (
          <li
            className="rounded-lg border border-border px-4 py-3"
            data-testid={`pulse-entry-${entry.id}`}
            key={entry.id}
          >
            <div className="flex items-start gap-3">
              <PubkeyAvatar
                avatarUrl={resolveAvatarUrl(entry.authorPubkey, profiles)}
                className="mt-0.5 rounded-full"
                label={resolveUserLabel({
                  pubkey: entry.authorPubkey,
                  profiles,
                  preferResolvedSelfLabel: true,
                })}
                pubkey={entry.authorPubkey}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">{entry.title}</span>
                  <span className="inline-flex items-center gap-0.5 text-badge text-muted-foreground">
                    {entry.tab === "agents" ? (
                      <Bot aria-hidden className="size-2.5" />
                    ) : (
                      <StickyNote aria-hidden className="size-2.5" />
                    )}
                    {resolveUserLabel({
                      pubkey: entry.authorPubkey,
                      profiles,
                      preferResolvedSelfLabel: true,
                    })}
                  </span>
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
                <p className="mt-1 whitespace-pre-wrap text-2xs text-muted-foreground">
                  {entry.body}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {entry.reactions.map((reaction) => (
                    <button
                      className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-secondary px-2 text-2xs leading-none hover:bg-accent disabled:opacity-60"
                      data-testid={`pulse-reaction-${entry.id}-${reaction.emoji}`}
                      disabled={update === null}
                      key={reaction.emoji}
                      onClick={() =>
                        update?.((current) =>
                          togglePulseReaction(
                            current,
                            entry.id,
                            reaction.emoji,
                          ),
                        )
                      }
                      type="button"
                    >
                      {reaction.emoji}
                      <span className="tabular-nums text-muted-foreground">
                        {reaction.count}
                      </span>
                    </button>
                  ))}
                  {update &&
                    QUICK_REACTIONS.filter(
                      (emoji) =>
                        !entry.reactions.some((row) => row.emoji === emoji),
                    ).map((emoji) => (
                      <button
                        aria-label={`${emoji} で反応する`}
                        className="inline-flex h-6 items-center rounded-full border border-dashed border-border px-2 text-2xs leading-none text-muted-foreground hover:bg-accent"
                        data-testid={`pulse-add-reaction-${entry.id}-${emoji}`}
                        key={emoji}
                        onClick={() =>
                          update((current) =>
                            togglePulseReaction(current, entry.id, emoji),
                          )
                        }
                        type="button"
                      >
                        {emoji}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {entries.length === 0 && (
        <p className="mt-4 text-2xs text-muted-foreground">
          このタブには何もありません。
        </p>
      )}
    </ShowcasePage>
  );
}
