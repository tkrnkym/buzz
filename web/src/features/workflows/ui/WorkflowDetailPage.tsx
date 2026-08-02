import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, X } from "lucide-react";
import { useMemo } from "react";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  formatDuration,
  latestRun,
  RUN_STATE_CLASSES,
  RUN_STATE_LABELS,
} from "@/features/workflows/workflow-model";
import { WorkflowRunTrace } from "@/features/workflows/ui/WorkflowRunTrace";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import { useShowcase } from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";

/**
 * One workflow: what starts it, what it does, and what happened last time.
 *
 * A run held for approval gets its decision buttons at the top rather than
 * buried under the trace — it is the only thing on this page anyone has to act
 * on, and the trace is there to explain the decision, not to precede it.
 */
export function WorkflowDetailPage({ workflowId }: { workflowId: string }) {
  const showcase = useShowcase();
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);
  const workflow = showcase?.workflows.find(
    (candidate) => candidate.id === workflowId,
  );

  if (!workflow) {
    return (
      <ShowcasePage title="Workflows">
        {showcase ? (
          <p className="text-sm text-muted-foreground">
            そのワークフローはありません。
          </p>
        ) : (
          <NotWiredUp what="ワークフロー" />
        )}
      </ShowcasePage>
    );
  }

  const run = latestRun(workflow);

  return (
    <ShowcasePage
      actions={
        <Link
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
          to="/workflows"
        >
          <ArrowLeft aria-hidden className="size-3" />
          一覧へ
        </Link>
      }
      subtitle={`${workflow.triggerDetail} · #${workflow.channel}`}
      title={workflow.name}
    >
      <p className="text-sm text-muted-foreground">{workflow.description}</p>

      {run?.state === "waiting" && (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3"
          data-testid="workflow-approval"
        >
          <p className="min-w-0 flex-1 text-2xs">
            この実行は承認を待っています。
          </p>
          <div className="flex gap-2">
            <button
              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
              disabled
              type="button"
            >
              <Check aria-hidden className="size-3" />
              承認
            </button>
            <button
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium disabled:opacity-60"
              disabled
              type="button"
            >
              <X aria-hidden className="size-3" />
              却下
            </button>
          </div>
        </div>
      )}

      {run ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            最新の実行
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-badge font-medium normal-case tracking-normal",
                RUN_STATE_CLASSES[run.state],
              )}
            >
              {RUN_STATE_LABELS[run.state]}
            </span>
            <span className="font-normal normal-case tracking-normal text-muted-foreground">
              {formatRelativeTime(run.startedAt, nowSeconds)} ·{" "}
              {formatDuration(run.durationMs || null)}
            </span>
          </h2>
          <div className="mt-3">
            <WorkflowRunTrace run={run} />
          </div>
        </section>
      ) : (
        <p className="mt-6 text-2xs text-muted-foreground">
          まだ一度も実行されていません。
        </p>
      )}

      {workflow.runs.length > 1 && (
        <section className="mt-8">
          <h2 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            これまでの実行
          </h2>
          <ul className="mt-2 flex flex-col gap-1" data-testid="workflow-runs">
            {workflow.runs.slice(1).map((entry) => (
              <li
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                key={entry.id}
              >
                <span className="min-w-0 truncate text-2xs text-muted-foreground">
                  {formatRelativeTime(entry.startedAt, nowSeconds)} ·{" "}
                  {entry.trigger}
                </span>
                <span className="shrink-0 text-badge text-muted-foreground">
                  {formatDuration(entry.durationMs || null)}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-badge font-medium",
                    RUN_STATE_CLASSES[entry.state],
                  )}
                >
                  {RUN_STATE_LABELS[entry.state]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ShowcasePage>
  );
}
