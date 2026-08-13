import {
  formatDuration,
  RUN_STATE_PROGRESS,
} from "@/features/workflows/workflow-model";
import type { WorkflowRun } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";
import { PROGRESS_STATUS } from "@/shared/lib/progress-status";

/**
 * A run, step by step.
 *
 * The rail down the left is what makes it read as a sequence rather than a
 * list: a workflow's steps are ordered and a reader is looking for where it
 * stopped, which is the first icon that is not a tick.
 *
 * The discs take their icon and colour from the shared progress table rather
 * than a local one. They had a local one, and it had drifted into saying the
 * opposite in two places — a finished step was grey while a held step was
 * greyer, so the rail's colours ranked nothing.
 */
export function WorkflowRunTrace({ run }: { run: WorkflowRun }) {
  return (
    <ol className="flex flex-col" data-testid="workflow-run-trace">
      {run.steps.map((step, index) => {
        const status = PROGRESS_STATUS[RUN_STATE_PROGRESS[step.state]];
        const Icon = status.Icon;
        const isLast = index === run.steps.length - 1;
        return (
          <li className="flex gap-3" key={step.id}>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full",
                  status.className,
                )}
              >
                <Icon
                  aria-hidden
                  className={cn("size-3", status.spins && "animate-spin")}
                />
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
                  {status.label} · {formatDuration(step.durationMs)}
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
