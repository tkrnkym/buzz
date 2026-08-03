import {
  Bot,
  CircleDot,
  GitBranch,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  Check,
  X,
} from "lucide-react";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  formatDiffStat,
  formatDivergence,
  ITEM_STATE_CLASSES,
  ITEM_STATE_LABELS,
  sortActivity,
} from "@/features/projects/project-model";
import { resolveUserLabel } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import type {
  ProjectActivityEntry,
  ProjectBranch,
  ProjectIssue,
  ProjectPullRequest,
} from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";

function StatePill({ state }: { state: ProjectIssue["state"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-badge font-medium",
        ITEM_STATE_CLASSES[state],
      )}
    >
      {ITEM_STATE_LABELS[state]}
    </span>
  );
}

export function IssuesPanel({
  issues,
  nowSeconds,
  onToggleState,
}: {
  issues: ProjectIssue[];
  nowSeconds: number;
  /** Omitted when there is nothing to write to. */
  onToggleState?: (issue: ProjectIssue) => void;
}) {
  const profiles = useProfiles(
    issues.flatMap((issue) =>
      [issue.authorPubkey, issue.assigneePubkey].filter(
        (value): value is string => value !== null,
      ),
    ),
  );

  if (issues.length === 0) {
    return (
      <p className="text-2xs text-muted-foreground">Issue はありません。</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="project-issues">
      {issues.map((issue) => (
        <li
          className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5"
          key={issue.id}
        >
          <CircleDot
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <span className="text-muted-foreground">#{issue.number}</span>{" "}
              {issue.title}
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {resolveUserLabel({
                pubkey: issue.authorPubkey,
                profiles,
                preferResolvedSelfLabel: true,
              })}
              {issue.assigneePubkey &&
                ` → ${resolveUserLabel({
                  pubkey: issue.assigneePubkey,
                  profiles,
                  preferResolvedSelfLabel: true,
                })}`}{" "}
              · {formatRelativeTime(issue.updatedAt, nowSeconds)}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {issue.labels.map((label) => (
                <span
                  className="rounded bg-secondary px-1.5 py-0.5 text-badge text-secondary-foreground"
                  key={label}
                >
                  {label}
                </span>
              ))}
              {issue.commentCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-badge text-muted-foreground">
                  <MessageSquare aria-hidden className="size-2.5" />
                  {issue.commentCount}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatePill state={issue.state} />
            {onToggleState && (
              <button
                className="rounded-md border border-border px-2 py-0.5 text-badge hover:bg-accent"
                data-testid={`toggle-issue-${issue.id}`}
                onClick={() => onToggleState(issue)}
                type="button"
              >
                {issue.state === "open" ? "閉じる" : "開き直す"}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PullRequestsPanel({
  nowSeconds,
  onMerge,
  pullRequests,
}: {
  nowSeconds: number;
  /** Omitted when there is nothing to write to. */
  onMerge?: (pull: ProjectPullRequest) => void;
  pullRequests: ProjectPullRequest[];
}) {
  const profiles = useProfiles(pullRequests.map((pr) => pr.authorPubkey));

  if (pullRequests.length === 0) {
    return (
      <p className="text-2xs text-muted-foreground">
        プルリクエストはありません。
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="project-pull-requests">
      {pullRequests.map((pr) => (
        <li
          className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5"
          key={pr.id}
        >
          <GitPullRequest
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <span className="text-muted-foreground">#{pr.number}</span>{" "}
              {pr.title}
            </p>
            <p className="mt-0.5 truncate font-mono text-badge text-muted-foreground">
              {pr.branch}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-badge">
              <span className="font-mono text-muted-foreground">
                {formatDiffStat(pr.additions, pr.deletions)}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-0.5",
                  pr.checksPassing ? "text-primary" : "text-destructive",
                )}
              >
                {pr.checksPassing ? (
                  <Check aria-hidden className="size-2.5" />
                ) : (
                  <X aria-hidden className="size-2.5" />
                )}
                {pr.checksPassing ? "CI 通過" : "CI 失敗"}
              </span>
              <span className="text-muted-foreground">承認 {pr.approvals}</span>
              <span className="text-muted-foreground">
                {resolveUserLabel({
                  pubkey: pr.authorPubkey,
                  profiles,
                  preferResolvedSelfLabel: true,
                })}{" "}
                · {formatRelativeTime(pr.updatedAt, nowSeconds)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatePill state={pr.state} />
            {onMerge && pr.state !== "merged" && pr.state !== "closed" && (
              <button
                // Not disabled on a red CI: merging anyway is a decision someone
                // is allowed to make, and the state is already on the row above.
                className="rounded-md border border-border px-2 py-0.5 text-badge hover:bg-accent"
                data-testid={`merge-pull-${pr.id}`}
                onClick={() => onMerge(pr)}
                type="button"
              >
                マージ
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function BranchesPanel({
  branches,
  defaultBranch,
  nowSeconds,
}: {
  branches: ProjectBranch[];
  defaultBranch: string;
  nowSeconds: number;
}) {
  const profiles = useProfiles(branches.map((branch) => branch.lastCommitBy));

  return (
    <ul className="flex flex-col gap-2" data-testid="project-branches">
      {branches.map((branch) => (
        <li
          className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
          key={branch.name}
        >
          <GitBranch
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              <span className="truncate font-mono text-2xs">{branch.name}</span>
              {branch.name === defaultBranch && (
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-badge text-secondary-foreground">
                  既定
                </span>
              )}
            </p>
            <p className="mt-0.5 text-badge text-muted-foreground">
              {formatDivergence(branch.aheadBy, branch.behindBy)} ·{" "}
              {resolveUserLabel({
                pubkey: branch.lastCommitBy,
                profiles,
                preferResolvedSelfLabel: true,
              })}{" "}
              · {formatRelativeTime(branch.lastCommitAt, nowSeconds)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const ACTIVITY_ICONS = {
  commit: GitCommit,
  issue: CircleDot,
  pull_request: GitPullRequest,
  review: Check,
  agent: Bot,
} as const;

export function ActivityPanel({
  entries,
  nowSeconds,
}: {
  entries: ProjectActivityEntry[];
  nowSeconds: number;
}) {
  const sorted = sortActivity(entries);
  const profiles = useProfiles(sorted.map((entry) => entry.actorPubkey));

  return (
    <ul className="flex flex-col gap-3" data-testid="project-activity">
      {sorted.map((entry) => {
        const Icon = ACTIVITY_ICONS[entry.kind];
        return (
          <li className="flex items-start gap-3" key={entry.id}>
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                // An agent's entry is tinted: a feed where a person and a bot
                // look identical is one where nobody notices the bot.
                entry.kind === "agent" ? "bg-primary/10" : "bg-secondary",
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-3",
                  entry.kind === "agent"
                    ? "text-primary"
                    : "text-secondary-foreground",
                )}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-2xs">
                <span className="font-medium">
                  {resolveUserLabel({
                    pubkey: entry.actorPubkey,
                    profiles,
                    preferResolvedSelfLabel: true,
                  })}
                </span>{" "}
                {entry.summary}
              </p>
              <p className="text-badge text-muted-foreground">
                {formatRelativeTime(entry.at, nowSeconds)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
