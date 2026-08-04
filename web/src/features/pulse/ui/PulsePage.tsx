import { AlertTriangle, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useMyPubkey } from "@/features/chat/use-chat";
import { useProfiles } from "@/features/profile/profile-store";
import {
  hasFailure,
  pulseEntriesFor,
  pulseTabCounts,
} from "@/features/pulse/pulse-model";
import { PulseCard } from "@/features/pulse/ui/PulseCard";
import { useShell } from "@/features/shell/shell-context";
import {
  addPulseNote,
  togglePulseReaction,
} from "@/features/showcase/showcase-mutations";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import {
  nextMockId,
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import type { PulseTab } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";
import { FormDialog } from "@/shared/ui/form-dialog";

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
 *
 * The tabs carry counts, and the agents tab says when something in it has
 * stopped. With three unlabelled tabs there is no telling an empty one from one
 * nobody has opened, and a stopped agent waiting behind a tab that does not
 * mention it is the case this feed exists to catch.
 */
export function PulsePage() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const myPubkey = useMyPubkey();
  const { channels } = useShell();
  const [tab, setTab] = useState<PulseTab>("all");
  const [composing, setComposing] = useState(false);
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);

  const all = showcase?.pulse ?? [];
  const entries = useMemo(() => pulseEntriesFor(all, tab), [all, tab]);
  const counts = useMemo(() => pulseTabCounts(all), [all]);
  const failing = useMemo(
    () => hasFailure(all.filter((entry) => entry.tab === "agents")),
    [all],
  );
  const profiles = useProfiles(entries.map((entry) => entry.authorPubkey));
  // Entries name a channel; the router needs its id. Resolved here rather than in
  // the card so the lookup happens once per render instead of once per row.
  const channelIds = useMemo(() => {
    const byName = new Map<string, string>();
    for (const channel of channels) byName.set(channel.name, channel.id);
    return byName;
  }, [channels]);

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
      actions={
        <button
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
          data-testid="create-pulse-note"
          disabled={update === null}
          onClick={() => setComposing(true)}
          type="button"
        >
          <Plus aria-hidden className="size-3" />
          ノートを書く
        </button>
      }
      subtitle="覚えておきたいことと、自動で届いたこと"
      title="Pulse"
    >
      <div className="flex items-center gap-1" data-testid="pulse-tabs">
        {TABS.map((option) => (
          <button
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs font-medium transition-colors",
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
            <span className="tabular-nums text-muted-foreground">
              {counts[option.value]}
            </span>
            {/* Said on the tab, not only behind it: the reason to open a feed of
                agent reports is usually that one of them stopped. */}
            {option.value === "agents" && failing && (
              <AlertTriangle
                aria-label="止まっているエージェントがあります"
                className="size-3 text-destructive"
                data-testid="pulse-tab-agents-alert"
              />
            )}
          </button>
        ))}
      </div>

      <ul className="mt-4 flex flex-col gap-3" data-testid="pulse-list">
        {entries.map((entry) => (
          <PulseCard
            channelId={
              entry.channel === null
                ? null
                : (channelIds.get(entry.channel) ?? null)
            }
            entry={entry}
            key={entry.id}
            nowSeconds={nowSeconds}
            profiles={profiles}
            {...(update
              ? {
                  onToggleReaction: (emoji: string) =>
                    update((current) =>
                      togglePulseReaction(current, entry.id, emoji),
                    ),
                }
              : {})}
          />
        ))}
      </ul>

      {entries.length === 0 && (
        <p className="mt-4 text-2xs text-muted-foreground">
          このタブには何もありません。
        </p>
      )}

      {composing && update && (
        <FormDialog
          description="あとから探せる場所に残します。チャンネル名は任意です。"
          fields={[
            {
              name: "title",
              label: "タイトル",
              placeholder: "リリース手順のメモ",
              required: true,
            },
            {
              name: "body",
              label: "本文",
              multiline: true,
              placeholder: "何を覚えておきたいのか",
              required: true,
            },
            {
              name: "channel",
              label: "チャンネル（任意）",
              placeholder: "dev",
            },
          ]}
          onClose={() => setComposing(false)}
          onSubmit={(values) => {
            const channel = values.channel.trim().replace(/^#/, "");
            update((current) =>
              addPulseNote(current, {
                id: nextMockId("pulse"),
                authorPubkey: myPubkey ?? "",
                title: values.title,
                body: values.body,
                channel: channel === "" ? null : channel,
                at: Math.floor(Date.now() / 1000),
              }),
            );
            setComposing(false);
            // Onto the tab it landed on, so the reader sees what they wrote
            // rather than wondering where it went.
            setTab("notes");
            toast.success("ノートを追加しました");
          }}
          submitLabel="残す"
          testId="create-pulse-dialog"
          title="ノートを書く"
        />
      )}
    </ShowcasePage>
  );
}
