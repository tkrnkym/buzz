import { Link } from "@tanstack/react-router";
import { CircleDot, GitPullRequest, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { openCounts, sortProjects } from "@/features/projects/project-model";
import { resolveAvatarUrl } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import {
  addProject,
  projectFromDraft,
} from "@/features/projects/project-mutations";
import { useMyPubkey } from "@/features/chat/use-chat";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import {
  nextMockId,
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import { FormDialog } from "@/shared/ui/form-dialog";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

/**
 * The project list.
 *
 * A card leads with the two counts that decide whether to open it — open issues
 * and open pull requests — because "how much is waiting here" is the question a
 * project list is read to answer.
 */
export function ProjectsPage() {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const myPubkey = useMyPubkey();
  const [creating, setCreating] = useState(false);
  const projects = useMemo(
    () => sortProjects(showcase?.projects ?? []),
    [showcase],
  );
  const members = useMemo(
    () => projects.flatMap((project) => project.memberPubkeys),
    [projects],
  );
  const profiles = useProfiles(members);

  if (!showcase) {
    return (
      <ShowcasePage subtitle="リポジトリと、その周りの作業" title="Projects">
        <NotWiredUp what="プロジェクト" />
      </ShowcasePage>
    );
  }

  return (
    <ShowcasePage
      actions={
        <button
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
          data-testid="create-project"
          disabled={update === null}
          onClick={() => setCreating(true)}
          type="button"
        >
          <Plus aria-hidden className="size-3" />
          プロジェクトを作る
        </button>
      }
      subtitle="リポジトリと、その周りの作業"
      title="Projects"
    >
      <ul className="flex flex-col gap-3" data-testid="project-list">
        {projects.map((project) => {
          const counts = openCounts(project);
          return (
            <li key={project.id}>
              <Link
                className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-accent/50"
                data-testid={`project-card-${project.name}`}
                params={{ projectId: project.id }}
                to="/projects/$projectId"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{project.name}</p>
                  <p className="mt-0.5 truncate text-2xs text-muted-foreground">
                    {project.description}
                  </p>
                  <p className="mt-1 font-mono text-badge text-muted-foreground">
                    {project.repo}
                  </p>

                  <div className="mt-2 flex items-center gap-3 text-2xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CircleDot aria-hidden className="size-3" />
                      {counts.issues} オープン
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <GitPullRequest aria-hidden className="size-3" />
                      {counts.pullRequests} レビュー待ち
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 -space-x-1.5">
                  {project.memberPubkeys.map((pubkey) => (
                    <PubkeyAvatar
                      avatarUrl={resolveAvatarUrl(pubkey, profiles)}
                      className="rounded-full ring-2 ring-background"
                      key={pubkey}
                      pubkey={pubkey}
                      size="sm"
                    />
                  ))}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {creating && update && (
        <FormDialog
          description="リポジトリと、その周りの作業をまとめる場所です。"
          fields={[
            {
              name: "name",
              label: "名前",
              placeholder: "リレー",
              required: true,
            },
            {
              name: "repo",
              label: "リポジトリ",
              placeholder: "tkrnkym/nuxx",
              required: true,
            },
            {
              name: "description",
              label: "説明",
              placeholder: "何のプロジェクトか",
            },
            {
              name: "defaultBranch",
              label: "既定のブランチ",
              initial: "main",
              hint: "空にすると main になります。",
            },
          ]}
          onClose={() => setCreating(false)}
          onSubmit={(values) => {
            update((current) =>
              addProject(
                current,
                projectFromDraft(
                  {
                    name: values.name,
                    description: values.description ?? "",
                    repo: values.repo,
                    defaultBranch: values.defaultBranch ?? "main",
                  },
                  nextMockId("project"),
                  myPubkey ?? "",
                  Math.floor(Date.now() / 1000),
                ),
              ),
            );
            setCreating(false);
            toast.success(`${values.name} を作りました`);
          }}
          submitLabel="作成する"
          testId="create-project-dialog"
          title="プロジェクトを作る"
        />
      )}
    </ShowcasePage>
  );
}
