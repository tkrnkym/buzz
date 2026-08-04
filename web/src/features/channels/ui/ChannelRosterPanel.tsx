import { Bot, Check, Copy, TimerOff, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AGENT_STATUS_DOT,
  AGENT_STATUS_LABELS,
} from "@/features/agents/agent-model";
import {
  channelRoster,
  ROLE_LABELS,
  rosterCounts,
  type RosterPerson,
} from "@/features/channels/channel-roster-model";
import { formatTimeoutRemaining } from "@/features/moderation/moderation-model";
import {
  resolveAvatarUrl,
  resolveUserLabel,
} from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { useShowcase } from "@/features/showcase/use-showcase";
import type { ShowcaseAgent } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

/** One person in the roster. */
function PersonRow({
  label,
  nowMs,
  person,
  status,
  avatarUrl,
}: {
  label: string;
  nowMs: number;
  person: RosterPerson;
  status: string | null;
  avatarUrl: string | null;
}) {
  const remaining = formatTimeoutRemaining(person.timeoutUntilMs, nowMs);

  return (
    <li
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50"
      data-testid={`roster-person-${person.pubkey}`}
    >
      <PubkeyAvatar
        avatarUrl={avatarUrl}
        badge={
          // Same rule as the timeline: no status means "not established", not
          // "offline", so an unknown one shows nothing rather than a grey dot.
          status !== null && status !== "offline" ? (
            <span
              aria-label={`状態: ${status}`}
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background",
                status === "online" ? "bg-primary" : "bg-muted-foreground",
              )}
              role="img"
            />
          ) : null
        }
        label={label}
        pubkey={person.pubkey}
        shape="circle"
        size="sm"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-2xs">{label}</span>
        {/* A running timeout is the one thing about a member that changes what
            they can do in the room, so it replaces the quiet secondary line. */}
        {remaining !== null && (
          <span
            className="flex items-center gap-1 text-badge text-destructive"
            data-testid={`roster-timeout-${person.pubkey}`}
          >
            <TimerOff aria-hidden className="size-2.5" />
            タイムアウト中 あと{remaining}
          </span>
        )}
      </span>
      {person.role !== "member" && (
        <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-badge font-medium text-secondary-foreground">
          {ROLE_LABELS[person.role]}
        </span>
      )}
    </li>
  );
}

/** One agent assigned to this channel. */
function AgentRow({ agent }: { agent: ShowcaseAgent }) {
  return (
    <li
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50"
      data-testid={`roster-agent-${agent.name}`}
    >
      <span className="relative flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
        <Bot aria-hidden className="size-3.5 text-muted-foreground" />
        <span
          aria-label={AGENT_STATUS_LABELS[agent.status]}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background",
            AGENT_STATUS_DOT[agent.status],
          )}
          role="img"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-2xs">{agent.name}</span>
        {/* What it is doing, not that it exists — the same line the Agents screen
            leads with, because "実行中" with no object is the state operators
            complained about. */}
        <span className="block truncate text-badge text-muted-foreground">
          {agent.activity ?? agent.purpose}
        </span>
      </span>
    </li>
  );
}

/** The invite link, copied rather than shown as something to retype. */
function InviteRow() {
  const [copied, setCopied] = useState(false);
  const url = useMemo(
    () => new URL("/invite/demo-code", window.location.href).href,
    [],
  );

  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent/50"
      data-testid="roster-invite"
      onClick={() => {
        void navigator.clipboard
          .writeText(url)
          .then(() => {
            setCopied(true);
            toast.success("招待リンクをコピーしました");
          })
          .catch(() => toast.error("コピーできませんでした"));
      }}
      type="button"
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
        <UserPlus aria-hidden className="size-3.5 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xs">招待する</span>
        <span className="block truncate text-badge text-muted-foreground">
          {url}
        </span>
      </span>
      {copied ? (
        <Check aria-hidden className="size-3.5 shrink-0 text-primary" />
      ) : (
        <Copy aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

/**
 * Who is in this channel.
 *
 * The pane the desktop client had beside its timeline and this client did not:
 * membership was only reachable from Settings, which answers "who is in the
 * community" rather than the question a reader has while reading a room. Sitting
 * where the conversation is means the invite is there too, at the moment someone
 * notices a person is missing.
 *
 * Sorting, per-channel agent assignment and the pane's exclusivity with the
 * thread panel are decided in `channel-roster-model.ts`.
 */
export function ChannelRosterPanel({
  channelName,
  onClose,
  statusOf,
}: {
  /** The channel's name without its `#`, or `null` for a DM or no channel. */
  channelName: string | null;
  onClose: () => void;
  statusOf: (pubkey: string) => string | null;
}) {
  const showcase = useShowcase();
  const nowMs = Date.now();
  const roster = useMemo(
    () =>
      channelRoster({
        agents: showcase?.agents ?? [],
        channelName,
        members: showcase?.members ?? [],
      }),
    [showcase, channelName],
  );
  const profiles = useProfiles(roster.people.map((person) => person.pubkey));

  return (
    <aside
      aria-label="メンバー"
      className="flex w-72 shrink-0 flex-col bg-background shadow-panel-left"
      data-testid="roster-panel"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-2xs font-semibold">メンバー</h2>
          <p className="text-badge text-muted-foreground">
            {rosterCounts(roster)}
          </p>
        </div>
        <button
          aria-label="メンバーを閉じる"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          data-testid="roster-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {showcase === null ? (
          // Outside the demo build the fixtures are deliberately null. Saying so
          // beats an empty list, which reads as a community with nobody in it.
          <p className="p-2 text-badge text-muted-foreground">
            メンバー一覧はまだリレーから読めていません。
          </p>
        ) : (
          <>
            <ul className="flex flex-col">
              {roster.people.map((person) => (
                <PersonRow
                  avatarUrl={resolveAvatarUrl(person.pubkey, profiles)}
                  key={person.pubkey}
                  label={resolveUserLabel({
                    pubkey: person.pubkey,
                    profiles,
                    preferResolvedSelfLabel: true,
                  })}
                  nowMs={nowMs}
                  person={person}
                  status={statusOf(person.pubkey)}
                />
              ))}
            </ul>

            {roster.agents.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-3 text-badge font-medium uppercase text-muted-foreground">
                  エージェント
                </p>
                <ul className="flex flex-col">
                  {roster.agents.map((agent) => (
                    <AgentRow agent={agent} key={agent.id} />
                  ))}
                </ul>
              </>
            )}

            <div className="mt-3 border-t border-border pt-1.5">
              <InviteRow />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
