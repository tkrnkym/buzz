/**
 * Fixture edits for the Projects screen.
 *
 * Issues and pull requests are numbered per project, and the number is the thing
 * people say out loud ("#42"). So it is allocated from the highest existing one
 * rather than from a global counter — two projects each having a #1 is correct,
 * and a project whose issues jump from #3 to #17 is not.
 */

import type {
  ProjectActivityEntry,
  ProjectIssue,
  ProjectPullRequest,
  Showcase,
  ShowcaseProject,
} from "@/mock/showcase";

export interface ProjectDraft {
  name: string;
  description: string;
  repo: string;
  defaultBranch: string;
}

export interface IssueDraft {
  title: string;
  labels: string[];
}

export interface PullRequestDraft {
  title: string;
  branch: string;
}

/** The next number for a list of numbered items. */
function nextNumber(items: { number: number }[]): number {
  return items.reduce((highest, item) => Math.max(highest, item.number), 0) + 1;
}

export function projectFromDraft(
  draft: ProjectDraft,
  id: string,
  ownerPubkey: string,
  nowSeconds: number,
  existing?: ShowcaseProject,
): ShowcaseProject {
  return {
    id,
    name: draft.name.trim(),
    description: draft.description.trim(),
    repo: draft.repo.trim(),
    defaultBranch: draft.defaultBranch.trim() || "main",
    openIssues: existing?.openIssues ?? 0,
    openPullRequests: existing?.openPullRequests ?? 0,
    memberPubkeys: existing?.memberPubkeys ?? [ownerPubkey],
    updatedAt: nowSeconds,
    issues: existing?.issues ?? [],
    pullRequests: existing?.pullRequests ?? [],
    // A new project has its default branch and nothing else — a branch list that
    // started empty would render as a repository with no branches at all.
    branches: existing?.branches ?? [
      {
        name: draft.defaultBranch.trim() || "main",
        aheadBy: 0,
        behindBy: 0,
        lastCommitAt: nowSeconds,
        lastCommitBy: ownerPubkey,
      },
    ],
    activity: existing?.activity ?? [],
  };
}

export function addProject(
  current: Showcase,
  project: ShowcaseProject,
): Showcase {
  return { ...current, projects: [...current.projects, project] };
}

export function replaceProject(
  current: Showcase,
  project: ShowcaseProject,
): Showcase {
  return {
    ...current,
    projects: current.projects.map((row) =>
      row.id === project.id ? project : row,
    ),
  };
}

export function removeProject(current: Showcase, id: string): Showcase {
  return {
    ...current,
    projects: current.projects.filter((row) => row.id !== id),
  };
}

/** Apply a change to one project, leaving the rest alone. */
function inProject(
  current: Showcase,
  projectId: string,
  change: (project: ShowcaseProject) => ShowcaseProject,
): Showcase {
  return {
    ...current,
    projects: current.projects.map((project) =>
      project.id === projectId ? change(project) : project,
    ),
  };
}

/** An activity row, so the feed reflects what just happened. */
function activityEntry(
  kind: ProjectActivityEntry["kind"],
  id: string,
  actorPubkey: string,
  summary: string,
  nowSeconds: number,
): ProjectActivityEntry {
  return { id, kind, actorPubkey, summary, at: nowSeconds };
}

export function addIssue(
  current: Showcase,
  projectId: string,
  draft: IssueDraft,
  id: string,
  authorPubkey: string,
  nowSeconds: number,
): Showcase {
  return inProject(current, projectId, (project) => {
    const issue: ProjectIssue = {
      id,
      number: nextNumber([...project.issues, ...project.pullRequests]),
      title: draft.title.trim(),
      state: "open",
      authorPubkey,
      assigneePubkey: null,
      labels: draft.labels,
      commentCount: 0,
      updatedAt: nowSeconds,
    };
    return {
      ...project,
      issues: [issue, ...project.issues],
      openIssues: project.openIssues + 1,
      updatedAt: nowSeconds,
      // Prepended, because the feed is newest-first and the reader is looking at
      // it right now.
      activity: [
        activityEntry(
          "issue",
          `${id}-activity`,
          authorPubkey,
          `#${issue.number} ${issue.title} を作成`,
          nowSeconds,
        ),
        ...project.activity,
      ],
    };
  });
}

export function addPullRequest(
  current: Showcase,
  projectId: string,
  draft: PullRequestDraft,
  id: string,
  authorPubkey: string,
  nowSeconds: number,
): Showcase {
  return inProject(current, projectId, (project) => {
    const pull: ProjectPullRequest = {
      id,
      number: nextNumber([...project.issues, ...project.pullRequests]),
      title: draft.title.trim(),
      state: "open",
      authorPubkey,
      branch: draft.branch.trim(),
      additions: 0,
      deletions: 0,
      approvals: 0,
      // Unknown rather than passing: a pull request whose checks have not run yet
      // showing a green tick is the one lie a reviewer acts on.
      checksPassing: false,
      updatedAt: nowSeconds,
    };
    return {
      ...project,
      pullRequests: [pull, ...project.pullRequests],
      openPullRequests: project.openPullRequests + 1,
      updatedAt: nowSeconds,
      activity: [
        activityEntry(
          "pull_request",
          `${id}-activity`,
          authorPubkey,
          `#${pull.number} ${pull.title} を提出`,
          nowSeconds,
        ),
        ...project.activity,
      ],
    };
  });
}

/**
 * Close an issue or reopen it.
 *
 * The open count moves with it. A screen where the badge says three and the list
 * shows two is the sort of thing that gets read as a bug in the list.
 */
export function setIssueState(
  current: Showcase,
  projectId: string,
  issueId: string,
  state: ProjectIssue["state"],
  nowSeconds: number,
): Showcase {
  return inProject(current, projectId, (project) => {
    const before = project.issues.find((row) => row.id === issueId);
    if (!before) return project;
    const wasOpen = before.state === "open";
    const isOpen = state === "open";
    return {
      ...project,
      issues: project.issues.map((row) =>
        row.id === issueId ? { ...row, state, updatedAt: nowSeconds } : row,
      ),
      openIssues: project.openIssues + (isOpen ? 1 : 0) - (wasOpen ? 1 : 0),
      updatedAt: nowSeconds,
    };
  });
}

/** Merge a pull request. */
export function mergePullRequest(
  current: Showcase,
  projectId: string,
  pullId: string,
  actorPubkey: string,
  nowSeconds: number,
): Showcase {
  return inProject(current, projectId, (project) => {
    const pull = project.pullRequests.find((row) => row.id === pullId);
    if (!pull || pull.state === "merged") return project;
    return {
      ...project,
      pullRequests: project.pullRequests.map((row) =>
        row.id === pullId
          ? { ...row, state: "merged", updatedAt: nowSeconds }
          : row,
      ),
      openPullRequests: Math.max(0, project.openPullRequests - 1),
      updatedAt: nowSeconds,
      activity: [
        activityEntry(
          "pull_request",
          `${pullId}-merged`,
          actorPubkey,
          `#${pull.number} ${pull.title} をマージ`,
          nowSeconds,
        ),
        ...project.activity,
      ],
    };
  });
}
