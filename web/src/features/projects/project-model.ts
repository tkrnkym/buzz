/**
 * Presentation rules for projects.
 *
 * A project in the original client was a repository plus the work around it:
 * issues, pull requests, branches and a feed that mixed human and agent
 * activity. What is worth testing is the vocabulary — how a state reads, what
 * counts as open, how a diff is summarised — because those are the parts a
 * reader acts on and the parts a relay-backed version keeps.
 */

import type {
  ProjectActivityEntry,
  ProjectItemState,
  ShowcaseProject,
} from "@/mock/showcase";

export const ITEM_STATE_LABELS: Record<ProjectItemState, string> = {
  open: "オープン",
  in_review: "レビュー中",
  merged: "マージ済み",
  closed: "クローズ",
};

/**
 * Tailwind classes for a state pill.
 *
 * Merged is the only one that gets the accent: it is the state that ended the
 * work, and colouring "open" the same way makes a busy project look finished.
 */
export const ITEM_STATE_CLASSES: Record<ProjectItemState, string> = {
  open: "bg-secondary text-secondary-foreground",
  in_review: "bg-primary/10 text-primary",
  merged: "bg-primary text-primary-foreground",
  closed: "bg-muted text-muted-foreground",
};

/** States that still need someone. */
export function isOpenState(state: ProjectItemState): boolean {
  return state === "open" || state === "in_review";
}

/** `+412 −188`, the shape a diff is read in. */
export function formatDiffStat(additions: number, deletions: number): string {
  return `+${additions} −${deletions}`;
}

/**
 * How far a branch has diverged, in words.
 *
 * "同期済み" rather than "0 ahead, 0 behind": the numbers only mean something
 * when at least one is non-zero, and reading two zeros to work that out is work
 * the label can do.
 */
export function formatDivergence(aheadBy: number, behindBy: number): string {
  if (aheadBy === 0 && behindBy === 0) return "同期済み";
  const parts: string[] = [];
  if (aheadBy > 0) parts.push(`${aheadBy} 進んでいます`);
  if (behindBy > 0) parts.push(`${behindBy} 遅れています`);
  return parts.join("、");
}

/** Newest first — a project feed is read from the top. */
export function sortActivity(
  entries: ProjectActivityEntry[],
): ProjectActivityEntry[] {
  return [...entries].sort((left, right) => right.at - left.at);
}

/** Projects with the most recent movement first. */
export function sortProjects(projects: ShowcaseProject[]): ShowcaseProject[] {
  return [...projects].sort((left, right) => right.updatedAt - left.updatedAt);
}

/** Counts for the project card, computed rather than stored twice. */
export function openCounts(project: ShowcaseProject): {
  issues: number;
  pullRequests: number;
} {
  return {
    issues: project.issues.filter((issue) => isOpenState(issue.state)).length,
    pullRequests: project.pullRequests.filter((pr) => isOpenState(pr.state))
      .length,
  };
}
