import { Link } from "@tanstack/react-router";
import { CircleDot, GitPullRequest, Plus } from "lucide-react";
import { useMemo } from "react";

import { openCounts, sortProjects } from "@/features/projects/project-model";
import { resolveAvatarUrl } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import { useShowcase } from "@/features/showcase/use-showcase";
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
          disabled
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
    </ShowcasePage>
  );
}
