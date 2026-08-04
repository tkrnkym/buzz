import { Link } from "@tanstack/react-router";
import { ArrowLeft, CircleDot, GitPullRequest } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { openCounts } from "@/features/projects/project-model";
import {
  ActivityPanel,
  BranchesPanel,
  IssuesPanel,
  PullRequestsPanel,
} from "@/features/projects/ui/ProjectPanels";
import {
  addIssue,
  addPullRequest,
  mergePullRequest,
  setIssueState,
} from "@/features/projects/project-mutations";
import { useMyPubkey } from "@/features/chat/use-chat";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import {
  nextMockId,
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { FormDialog } from "@/shared/ui/form-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

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
  const update = useShowcaseUpdate();
  const myPubkey = useMyPubkey();
  const [tab, setTab] = useState<Tab>("overview");
  const [creating, setCreating] = useState<"issue" | "pull" | null>(null);
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
        <div className="flex flex-wrap items-center gap-2">
          {update && (
            <>
              <button
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
                data-testid="new-issue"
                onClick={() => setCreating("issue")}
                type="button"
              >
                <CircleDot aria-hidden className="size-3" />
                Issue
              </button>
              <button
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
                data-testid="new-pull-request"
                onClick={() => setCreating("pull")}
                type="button"
              >
                <GitPullRequest aria-hidden className="size-3" />
                PR
              </button>
            </>
          )}
          <Link
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
            to="/projects"
          >
            <ArrowLeft aria-hidden className="size-3" />
            一覧へ
          </Link>
        </div>
      }
      subtitle={project.repo}
      title={project.name}
    >
      {/* Real tabs: the list is one tab stop with the arrow keys moving inside
          it, and each trigger names the panel it controls. The row of
          independent buttons this replaced was four tab stops with no stated
          relationship to what they switched. */}
      <Tabs onValueChange={(next) => setTab(next as Tab)} value={tab}>
        <TabsList data-testid="project-tabs">
          {tabs.map((option) => (
            <TabsTrigger
              data-testid={`project-tab-${option.value}`}
              key={option.value}
              value={option.value}
            >
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4">
          <TabsContent value="overview">
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
          </TabsContent>
          <TabsContent value="issues">
            <IssuesPanel
              issues={project.issues}
              nowSeconds={nowSeconds}
              onToggleState={
                update
                  ? (issue) => {
                      const next = issue.state === "open" ? "closed" : "open";
                      update((current) =>
                        setIssueState(
                          current,
                          project.id,
                          issue.id,
                          next,
                          Math.floor(Date.now() / 1000),
                        ),
                      );
                      toast.success(
                        next === "closed"
                          ? `#${issue.number} を閉じました`
                          : `#${issue.number} を開き直しました`,
                      );
                    }
                  : undefined
              }
            />
          </TabsContent>
          <TabsContent value="pulls">
            <PullRequestsPanel
              nowSeconds={nowSeconds}
              onMerge={
                update
                  ? (pull) => {
                      update((current) =>
                        mergePullRequest(
                          current,
                          project.id,
                          pull.id,
                          myPubkey ?? "",
                          Math.floor(Date.now() / 1000),
                        ),
                      );
                      toast.success(`#${pull.number} をマージしました`);
                    }
                  : undefined
              }
              pullRequests={project.pullRequests}
            />
          </TabsContent>
          <TabsContent value="branches">
            <BranchesPanel
              branches={project.branches}
              defaultBranch={project.defaultBranch}
              nowSeconds={nowSeconds}
            />
          </TabsContent>
        </div>
      </Tabs>

      {creating === "issue" && update && (
        <FormDialog
          description="困っていることや、やることを書きます。"
          fields={[
            {
              name: "title",
              label: "タイトル",
              placeholder: "起動時に一瞬白い画面が出る",
              required: true,
            },
            {
              name: "labels",
              label: "ラベル",
              placeholder: "bug, ui",
              hint: "カンマで区切ります。",
            },
          ]}
          onClose={() => setCreating(null)}
          onSubmit={(values) => {
            update((current) =>
              addIssue(
                current,
                project.id,
                {
                  title: values.title,
                  labels: (values.labels ?? "")
                    .split(",")
                    .map((label) => label.trim())
                    .filter(Boolean),
                },
                nextMockId("issue"),
                myPubkey ?? "",
                Math.floor(Date.now() / 1000),
              ),
            );
            setCreating(null);
            setTab("issues");
            toast.success("Issue を作りました");
          }}
          submitLabel="作成する"
          testId="create-issue-dialog"
          title="Issue を作る"
        />
      )}

      {creating === "pull" && update && (
        <FormDialog
          description="変更をレビューに出します。"
          fields={[
            {
              name: "title",
              label: "タイトル",
              placeholder: "白い画面が出るのを直す",
              required: true,
            },
            {
              name: "branch",
              label: "ブランチ",
              placeholder: "fix/flash-of-white",
              required: true,
            },
          ]}
          onClose={() => setCreating(null)}
          onSubmit={(values) => {
            update((current) =>
              addPullRequest(
                current,
                project.id,
                { title: values.title, branch: values.branch },
                nextMockId("pull"),
                myPubkey ?? "",
                Math.floor(Date.now() / 1000),
              ),
            );
            setCreating(null);
            setTab("pulls");
            toast.success("PR を作りました");
          }}
          submitLabel="作成する"
          testId="create-pull-dialog"
          title="PR を作る"
        />
      )}
    </ShowcasePage>
  );
}
