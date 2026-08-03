import { Link } from "@tanstack/react-router";
import { Clock, Hash, Plus, Webhook, Zap } from "lucide-react";
import { useMemo } from "react";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  latestRun,
  RUN_STATE_CLASSES,
  RUN_STATE_LABELS,
  sortWorkflows,
  totalPendingApprovals,
} from "@/features/workflows/workflow-model";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import { useShowcase } from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";

/**
 * The workflow list.
 *
 * A card leads with its trigger, because "what starts this" is the thing a
 * reader has to hold in their head to make sense of the rest — a workflow named
 * "金曜リリース" that actually fires on a webhook is the surprise this avoids.
 */
export function WorkflowsPage() {
  const showcase = useShowcase();
  const workflows = useMemo(
    () => sortWorkflows(showcase?.workflows ?? []),
    [showcase],
  );
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);

  if (!showcase) {
    return (
      <ShowcasePage subtitle="決まった手順を自動で回す" title="Workflows">
        <NotWiredUp what="ワークフロー" />
      </ShowcasePage>
    );
  }

  const pending = totalPendingApprovals(workflows);

  return (
    <ShowcasePage
      actions={
        <button
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
          disabled
          type="button"
        >
          <Plus aria-hidden className="size-3" />
          ワークフローを作る
        </button>
      }
      subtitle={
        pending > 0 ? `${pending} 件が承認待ちです` : "決まった手順を自動で回す"
      }
      title="Workflows"
    >
      <ul className="flex flex-col gap-3" data-testid="workflow-list">
        {workflows.map((workflow) => {
          const run = latestRun(workflow);
          const TriggerIcon = workflow.trigger === "webhook" ? Webhook : Clock;
          return (
            <li key={workflow.id}>
              <Link
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-accent/50",
                  workflow.enabled
                    ? "border-border"
                    : // A disabled workflow is still listed — it is a thing that
                      // exists and someone turned off — but recedes.
                      "border-dashed border-border opacity-60",
                )}
                data-testid={`workflow-card-${workflow.name}`}
                params={{ workflowId: workflow.id }}
                to="/workflows/$workflowId"
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                  <Zap
                    aria-hidden
                    className="size-4 text-secondary-foreground"
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {workflow.name}
                    </span>
                    {workflow.pendingApprovals > 0 && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-badge text-primary">
                        承認待ち {workflow.pendingApprovals}
                      </span>
                    )}
                    {!workflow.enabled && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-badge text-muted-foreground">
                        停止中
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-2xs text-muted-foreground">
                    {workflow.description}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-badge text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <TriggerIcon aria-hidden className="size-3" />
                      {workflow.triggerDetail}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <Hash aria-hidden className="size-2.5" />
                      {workflow.channel}
                    </span>
                    {run && (
                      <span>
                        最終実行 {formatRelativeTime(run.startedAt, nowSeconds)}
                      </span>
                    )}
                  </div>
                </div>

                {run && (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-badge font-medium",
                      RUN_STATE_CLASSES[run.state],
                    )}
                  >
                    {RUN_STATE_LABELS[run.state]}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </ShowcasePage>
  );
}
