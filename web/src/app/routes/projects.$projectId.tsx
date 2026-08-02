import { createFileRoute } from "@tanstack/react-router";

import { ProjectDetailPage } from "@/features/projects/ui/ProjectDetailPage";

export const Route = createFileRoute("/_shell/projects/$projectId")({
  component: ProjectDetailRoute,
});

function ProjectDetailRoute() {
  const { projectId } = Route.useParams();
  return <ProjectDetailPage projectId={projectId} />;
}
