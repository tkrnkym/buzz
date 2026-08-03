import { Bot, Hash } from "lucide-react";

import {
  AGENT_STATUS_DOT,
  AGENT_STATUS_LABELS,
  formatRelativeTime,
} from "@/features/agents/agent-model";
import type { ShowcaseAgent } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";

/**
 * One agent, as a row in the list.
 *
 * The activity line is the point of the row: an agent is either doing something
 * nameable or it is not, and "実行中" without saying what is the state the
 * desktop client's users complained about most.
 */
export function AgentCard({
  agent,
  nowSeconds,
  onSelect,
  selected,
}: {
  agent: ShowcaseAgent;
  nowSeconds: number;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-accent/50",
      )}
      data-testid={`agent-card-${agent.name}`}
      onClick={onSelect}
      type="button"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
        <Bot aria-hidden className="size-4 text-secondary-foreground" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{agent.name}</span>
          <span
            aria-label={AGENT_STATUS_LABELS[agent.status]}
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              AGENT_STATUS_DOT[agent.status],
            )}
            role="img"
          />
          <span className="shrink-0 text-2xs text-muted-foreground">
            {AGENT_STATUS_LABELS[agent.status]}
          </span>
        </span>

        <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
          {agent.activity ?? agent.purpose}
        </span>

        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
        </span>
      </span>
    </button>
  );
}
