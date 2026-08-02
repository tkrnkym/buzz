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

export const RUN_STATE_LABELS: Record<WorkflowRunState, string> = {
  succeeded: "成功",
  failed: "失敗",
  running: "実行中",
  waiting: "待機",
};

/**
 * Tailwind classes for a run's badge.
 *
 * Waiting is tinted rather than grey: a run held for an approval is not idle,
 * it is a task assigned to a human, and greying it out is how it waits a week.
 */
export const RUN_STATE_CLASSES: Record<WorkflowRunState, string> = {
  succeeded: "bg-secondary text-secondary-foreground",
  failed: "bg-destructive/10 text-destructive",
  running: "bg-primary/10 text-primary",
  waiting: "bg-primary/10 text-primary",
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
