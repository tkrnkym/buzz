/**
 * Presentation rules for workflows.
 *
 * A workflow is a trigger, a list of steps, and a history of runs. What matters
 * to a reader is which run is the current one and where it stopped — the rest
 * is configuration they set once. These helpers answer exactly that.
 */

import type {
  ShowcaseWorkflow,
  WorkflowRun,
  WorkflowRunState,
} from "@/mock/showcase";
import {
  PROGRESS_STATUS,
  type ProgressStatus,
} from "@/shared/lib/progress-status";

/**
 * A run state, in the app-wide progress vocabulary.
 *
 * The mapping is here rather than in `shared/` so the shared vocabulary does
 * not have to know what a workflow is. `waiting` is an approval specifically —
 * a held run is a task assigned to a named human, not an idle one — which is
 * why it lands on the clock rather than the person.
 */
export const RUN_STATE_PROGRESS: Record<WorkflowRunState, ProgressStatus> = {
  succeeded: "done",
  failed: "failed",
  running: "running",
  waiting: "awaiting-approval",
};

/** Labels, taken from the shared table so the two cannot drift apart. */
export const RUN_STATE_LABELS: Record<WorkflowRunState, string> = {
  succeeded: PROGRESS_STATUS[RUN_STATE_PROGRESS.succeeded].label,
  failed: PROGRESS_STATUS[RUN_STATE_PROGRESS.failed].label,
  running: PROGRESS_STATUS[RUN_STATE_PROGRESS.running].label,
  waiting: PROGRESS_STATUS[RUN_STATE_PROGRESS.waiting].label,
};

/** The run a reader means when they say "the last run". */
export function latestRun(workflow: ShowcaseWorkflow): WorkflowRun | null {
  if (workflow.runs.length === 0) return null;
  return [...workflow.runs].sort(
    (left, right) => right.startedAt - left.startedAt,
  )[0];
}

/**
 * Where a run stopped, as a step index, or `null` if it ran to the end.
 *
 * The first step that is not finished — not the last finished one — because a
 * run with a failed step in the middle and skipped steps after it stopped at
 * the failure, and pointing at the end would say the opposite.
 */
export function stoppedAtIndex(run: WorkflowRun): number | null {
  const index = run.steps.findIndex(
    (step) => step.state === "failed" || step.state === "waiting",
  );
  return index === -1 ? null : index;
}

/** `1分36秒`, or `—` for a run that has not finished. */
export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}分` : `${minutes}分${seconds}秒`;
}

/** Enabled workflows first, then the ones with something waiting. */
export function sortWorkflows(
  workflows: ShowcaseWorkflow[],
): ShowcaseWorkflow[] {
  return [...workflows].sort(
    (left, right) =>
      Number(right.enabled) - Number(left.enabled) ||
      right.pendingApprovals - left.pendingApprovals ||
      left.name.localeCompare(right.name),
  );
}

/** How many runs across every workflow are waiting on a person. */
export function totalPendingApprovals(workflows: ShowcaseWorkflow[]): number {
  return workflows.reduce(
    (total, workflow) => total + workflow.pendingApprovals,
    0,
  );
}
