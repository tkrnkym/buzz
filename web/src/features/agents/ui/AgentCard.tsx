import { Hash, MoreVertical, Pause, Play } from "lucide-react";

import {
  AGENT_STATUS_DOT,
  AGENT_STATUS_LABELS,
  formatRelativeTime,
} from "@/features/agents/agent-model";
import type { ShowcaseAgent } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

/**
 * One agent, as a card.
 *
 * A card rather than the list row this was, because an agent is a thing with a
 * face: the original client gave each one a large portrait and a run badge, and
 * a 32px glyph in a text row carries neither. The portrait is the same identity
 * disc used everywhere else, at `xl` and circular — an agent has a pubkey like
 * anyone else, so it gets the same stable colour and the same tooltip rather
 * than a second avatar component of its own.
 *
 * The badge doubles as the run control. Paused and running are the two states an
 * operator acts on, and putting the action where the state is shown saves
 * opening the detail panel to find it.
 *
 * The activity line stays: an agent is either doing something nameable or it is
 * not, and "実行中" without saying what is the state the desktop client's users
 * complained about most.
 */
export function AgentCard({
  agent,
  nowSeconds,
  onDelete,
  onEdit,
  onSelect,
  onTogglePaused,
  selected,
}: {
  agent: ShowcaseAgent;
  nowSeconds: number;
  onDelete?: () => void;
  onEdit?: () => void;
  onSelect: () => void;
  onTogglePaused?: () => void;
  selected: boolean;
}) {
  const paused = agent.status === "paused";
  const hasMenu = Boolean(onEdit || onTogglePaused || onDelete);
  // The badge is a pause/resume control, so it only appears where it changes
  // something. `setAgentPaused` moves between paused and idle, which means
  // "resume" on an agent that is already idle — or errored — would be a button
  // that does nothing; those states show the status dot instead. The menu still
  // offers the action, because that is a list of what exists rather than a
  // control promising an effect.
  const runControl =
    onTogglePaused && (agent.status === "working" || paused)
      ? onTogglePaused
      : null;

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-2xl border transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-accent/40",
      )}
      data-testid={`agent-card-${agent.name}`}
    >
      {hasMenu && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            aria-label={`${agent.name} の操作`}
            className="absolute right-1.5 top-1.5 z-20 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid={`agent-menu-${agent.name}`}
            type="button"
          >
            <MoreVertical aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem
                data-testid={`agent-card-edit-${agent.name}`}
                onSelect={onEdit}
              >
                編集
              </DropdownMenuItem>
            )}
            {onTogglePaused && (
              <DropdownMenuItem
                data-testid={`agent-card-pause-${agent.name}`}
                onSelect={onTogglePaused}
              >
                {paused ? "再開" : "一時停止"}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid={`agent-card-delete-${agent.name}`}
                  destructive
                  onSelect={onDelete}
                >
                  削除
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="flex flex-1 items-center justify-center px-4 pb-3 pt-10">
        <PubkeyAvatar
          avatarUrl={agent.avatarUrl}
          badge={
            runControl ? (
              <button
                aria-label={
                  paused ? `${agent.name} を再開` : `${agent.name} を一時停止`
                }
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 z-20 flex size-8 items-center justify-center rounded-full border-2 border-background transition-colors",
                  paused
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                )}
                data-testid={`agent-run-${agent.name}`}
                onClick={runControl}
                type="button"
              >
                {paused ? (
                  <Play aria-hidden className="size-3.5 translate-x-px" />
                ) : (
                  <Pause aria-hidden className="size-3.5" />
                )}
              </button>
            ) : (
              <span
                aria-label={AGENT_STATUS_LABELS[agent.status]}
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-5 rounded-full border-2 border-background",
                  AGENT_STATUS_DOT[agent.status],
                )}
                role="img"
              />
            )
          }
          label={agent.name}
          pubkey={agent.pubkey}
          shape="circle"
          size="xl"
        />
      </div>

      <div className="flex flex-col gap-1 px-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{agent.name}</span>
          <span
            aria-label={AGENT_STATUS_LABELS[agent.status]}
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              AGENT_STATUS_DOT[agent.status],
            )}
            role="img"
          />
        </div>

        <p className="truncate text-2xs text-muted-foreground">
          {agent.activity ?? agent.purpose}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {agent.channels.map((channel) => (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 text-badge text-secondary-foreground"
              key={channel}
            >
              <Hash aria-hidden className="size-2.5" />
              {channel}
            </span>
          ))}
          <span className="text-badge text-muted-foreground">
            {formatRelativeTime(agent.lastActiveAt, nowSeconds)}
          </span>
        </div>
      </div>

      {/* The whole card selects, via an overlay rather than a wrapper, because a
          button inside a button is not a thing.
          It must come last and carry `z-10`: the avatar is `relative` (it hosts
          the badge), so a positioned sibling earlier in the DOM paints *under*
          it, and the avatar sits exactly at the card's centre — where a person
          clicks. Rendered first, the card looked selectable everywhere and was
          dead in the middle. The badge and the menu are `z-20` to stay above it,
          since those two are separate actions rather than "select this agent". */}
      <button
        aria-label={agent.name}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        data-testid={`agent-select-${agent.name}`}
        onClick={onSelect}
        type="button"
      />
    </div>
  );
}
