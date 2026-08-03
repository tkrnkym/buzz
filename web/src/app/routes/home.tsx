import { createFileRoute } from "@tanstack/react-router";

import { InboxPage } from "@/features/home/ui/InboxPage";

export const Route = createFileRoute("/_shell/home")({
  component: InboxPage,
});
