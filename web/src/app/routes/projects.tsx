import { createFileRoute } from "@tanstack/react-router";

import { ProjectsPage } from "@/features/projects/ui/ProjectsPage";

export const Route = createFileRoute("/_shell/projects")({
  component: ProjectsPage,
});
