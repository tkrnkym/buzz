import { createFileRoute } from "@tanstack/react-router";

import { ForumPage } from "@/features/forum/ui/ForumPage";

export const Route = createFileRoute("/_shell/forum")({
  component: ForumPage,
});
