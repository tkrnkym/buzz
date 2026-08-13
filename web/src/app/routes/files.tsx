import { createFileRoute } from "@tanstack/react-router";

import { FilesPage } from "@/features/files/ui/FilesPage";

export const Route = createFileRoute("/_shell/files")({
  component: FilesPage,
});
