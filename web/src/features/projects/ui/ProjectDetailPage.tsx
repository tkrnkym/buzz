import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";

import { openCounts } from "@/features/projects/project-model";
import {
  ActivityPanel,
  BranchesPanel,
  IssuesPanel,
  PullRequestsPanel,
} from "@/features/projects/ui/ProjectPanels";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import { useShowcase } from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";

type Tab = "overview" | "issues" | "pulls" | "branches";

/**
 * One project.
 *
 * Overview first, because the question that brings someone here is usually
 * "what happened" rather than "show me the list of issues" — the feed answers
 * it, and the tabs are there for when it does not.
 */
export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const showcase = useShowcase();
  const [tab, setTab] = useState<Tab>("overview");
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);

  const project = showcase?.projects.find(
    (candidate) => candidate.id === projectId,
  );

  if (!project) {
    return (
      <ShowcasePage title="Projects">
        {showcase ? (
          <p className="text-sm text-muted-foreground">
            そのプロジェクトはありません。
          </p>
        ) : (
          <NotWiredUp what="プロジェクト" />
        )}
      </ShowcasePage>
    );
  }

  const counts = openCounts(project);
  const tabs: { value: Tab; label: string }[] = [
    { value: "overview", label: "概要" },
    { value: "issues", label: `Issue (${counts.issues})` },
    { value: "pulls", label: `PR (${counts.pullRequests})` },
    { value: "branches", label: `ブランチ (${project.branches.length})` },
  ];

  return (
    <ShowcasePage
      actions={
        <Link
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
          to="/projects"
        >
          <ArrowLeft aria-hidden className="size-3" />
          一覧へ
        </Link>
      }
      subtitle={project.repo}
      title={project.name}
    >
      <div className="flex items-center gap-1" data-testid="project-tabs">
        {tabs.map((option) => (
          <button
            className={cn(
              "rounded-md px-2.5 py-1 text-2xs font-medium transition-colors",
              tab === option.value
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
            data-testid={`project-tab-${option.value}`}
            key={option.value}
            onClick={() => setTab(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "overview" && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-muted-foreground">
              {project.description}
            </p>
            <section>
              <h2 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                最近の動き
              </h2>
              <div className="mt-3">
                <ActivityPanel
                  entries={project.activity}
                  nowSeconds={nowSeconds}
                />
              </div>
            </section>
          </div>
        )}
        {tab === "issues" && (
          <IssuesPanel issues={project.issues} nowSeconds={nowSeconds} />
        )}
        {tab === "pulls" && (
          <PullRequestsPanel
            nowSeconds={nowSeconds}
            pullRequests={project.pullRequests}
          />
        )}
        {tab === "branches" && (
          <BranchesPanel
            branches={project.branches}
            defaultBranch={project.defaultBranch}
            nowSeconds={nowSeconds}
          />
        )}
      </div>
    </ShowcasePage>
  );
}
