import { Check, CircleDashed, Loader2, X } from "lucide-react";

import {
  formatDuration,
  RUN_STATE_LABELS,
} from "@/features/workflows/workflow-model";
import type { WorkflowRun, WorkflowRunState } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";

const STEP_ICONS: Record<WorkflowRunState, typeof Check> = {
  succeeded: Check,
  failed: X,
  running: Loader2,
  waiting: CircleDashed,
};

const STEP_ICON_CLASSES: Record<WorkflowRunState, string> = {
  succeeded: "bg-secondary text-secondary-foreground",
  failed: "bg-destructive text-destructive-foreground",
  running: "bg-primary text-primary-foreground",
  waiting: "bg-muted text-muted-foreground",
};

/**
 * A run, step by step.
 *
 * The rail down the left is what makes it read as a sequence rather than a
 * list: a workflow's steps are ordered and a reader is looking for where it
 * stopped, which is the first icon that is not a tick.
 */
export function WorkflowRunTrace({ run }: { run: WorkflowRun }) {
  return (
    <ol className="flex flex-col" data-testid="workflow-run-trace">
      {run.steps.map((step, index) => {
        const Icon = STEP_ICONS[step.state];
        const isLast = index === run.steps.length - 1;
        return (
          <li className="flex gap-3" key={step.id}>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full",
                  STEP_ICON_CLASSES[step.state],
                )}
              >
                <Icon aria-hidden className="size-3" />
              </span>
              {!isLast && <span className="w-px flex-1 bg-border" />}
            </div>

            <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-4")}>
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm">{step.name}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-badge text-secondary-foreground">
                  {step.action}
                </span>
                <span className="text-badge text-muted-foreground">
                  {RUN_STATE_LABELS[step.state]} ·{" "}
                  {formatDuration(step.durationMs)}
                </span>
              </p>
              {step.condition && (
                // The guard is the part that explains a skipped step, so it is
                // shown rather than hidden behind the step's own detail view.
                <p className="mt-0.5 font-mono text-badge text-muted-foreground">
                  if {step.condition}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
