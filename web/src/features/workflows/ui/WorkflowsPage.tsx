import { Link } from "@tanstack/react-router";
import { Clock, Hash, Plus, Webhook, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  latestRun,
  RUN_STATE_PROGRESS,
  sortWorkflows,
  totalPendingApprovals,
} from "@/features/workflows/workflow-model";
import { emptyWorkflowForm } from "@/features/workflows/workflow-form";
import {
  addWorkflow,
  workflowFromForm,
} from "@/features/workflows/workflow-mutations";
import { WorkflowFormDialog } from "@/features/workflows/ui/WorkflowFormDialog";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import {
  nextMockId,
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";
import { ProgressBadge } from "@/shared/ui/ProgressBadge";

/**
 * The workflow list.
 *
 * A card leads with its trigger, because "what starts this" is the thing a
 * reader has to hold in their head to make sense of the rest — a workflow named
 * "金曜リリース" that actually fires on a webhook is the surprise this avoids.
 */
export function WorkflowsPage() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const [creating, setCreating] = useState(false);
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
          data-testid="create-workflow"
          disabled={update === null}
          onClick={() => setCreating(true)}
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
                      <ProgressBadge
                        count={workflow.pendingApprovals}
                        status="awaiting-approval"
                      />
                    )}
                    {!workflow.enabled && <ProgressBadge status="stopped" />}
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
                  <ProgressBadge status={RUN_STATE_PROGRESS[run.state]} />
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {creating && update && (
        <WorkflowFormDialog
          initial={emptyWorkflowForm()}
          onClose={() => setCreating(false)}
          onSave={(form) => {
            update((current) =>
              addWorkflow(
                current,
                workflowFromForm(form, nextMockId("workflow")),
              ),
            );
            setCreating(false);
            toast.success(`${form.name} を作成しました`);
          }}
        />
      )}
    </ShowcasePage>
  );
}
