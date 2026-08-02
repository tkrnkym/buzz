import { Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";

import {
  groupAgentsByChannel,
  sortAgents,
  workingCount,
} from "@/features/agents/agent-model";
import { AgentCard } from "@/features/agents/ui/AgentCard";
import { AgentDetailPanel } from "@/features/agents/ui/AgentDetailPanel";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import { useShowcase } from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";

type Grouping = "status" | "channel";

/**
 * The Agents screen.
 *
 * Two groupings because operators ask two different questions: "what is
 * happening right now" (status, the default — errors first) and "what is in
 * this room" (channel). The desktop client had both for the same reason.
 */
export function AgentsPage() {
  const showcase = useShowcase();
  const [grouping, setGrouping] = useState<Grouping>("status");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);

  const agents = showcase?.agents ?? [];
  const teams = showcase?.agentTeams ?? [];
  const sorted = useMemo(() => sortAgents(agents), [agents]);
  const byChannel = useMemo(() => groupAgentsByChannel(agents), [agents]);
  const selected =
    sorted.find((agent) => agent.id === selectedId) ?? sorted[0] ?? null;

  if (!showcase) {
    return (
      <ShowcasePage subtitle="このコミュニティのエージェント" title="Agents">
        <NotWiredUp what="エージェント" />
      </ShowcasePage>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <ShowcasePage
        actions={
          <button
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
            data-testid="create-agent"
            disabled
            type="button"
          >
            <Plus aria-hidden className="size-3" />
            エージェントを作る
          </button>
        }
        subtitle={`${agents.length} 体中 ${workingCount(agents)} 体が実行中`}
        title="Agents"
      >
        <div className="flex items-center gap-1" data-testid="agent-grouping">
          {(
            [
              { value: "status", label: "状態順" },
              { value: "channel", label: "チャンネル別" },
            ] as const
          ).map((option) => (
            <button
              className={cn(
                "rounded-md px-2.5 py-1 text-2xs font-medium transition-colors",
                grouping === option.value
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
              key={option.value}
              onClick={() => setGrouping(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        {grouping === "status" ? (
          <ul className="mt-4 flex flex-col gap-2" data-testid="agent-list">
            {sorted.map((agent) => (
              <li key={agent.id}>
                <AgentCard
                  agent={agent}
                  nowSeconds={nowSeconds}
                  onSelect={() => setSelectedId(agent.id)}
                  selected={selected?.id === agent.id}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 flex flex-col gap-5" data-testid="agent-list">
            {byChannel.map((group) => (
              <section key={group.channel}>
                <h2 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  #{group.channel}
                </h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {group.agents.map((agent) => (
                    <li key={`${group.channel}:${agent.id}`}>
                      <AgentCard
                        agent={agent}
                        nowSeconds={nowSeconds}
                        onSelect={() => setSelectedId(agent.id)}
                        selected={selected?.id === agent.id}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {teams.length > 0 && (
          <section className="mt-8">
            <h2 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              チーム
            </h2>
            <ul className="mt-2 flex flex-col gap-2" data-testid="agent-teams">
              {teams.map((team) => (
                <li
                  className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5"
                  key={team.id}
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                    <Users
                      aria-hidden
                      className="size-4 text-secondary-foreground"
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{team.name}</p>
                    <p className="text-2xs text-muted-foreground">
                      {team.description}
                    </p>
                    <p className="mt-1 text-badge text-muted-foreground">
                      {team.agentIds
                        .map(
                          (id) =>
                            agents.find((agent) => agent.id === id)?.name ?? id,
                        )
                        .join(" → ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </ShowcasePage>

      {selected && (
        <AgentDetailPanel agent={selected} nowSeconds={nowSeconds} />
      )}
    </div>
  );
}
