import { createFileRoute } from "@tanstack/react-router";

import { AgentsPage } from "@/features/agents/ui/AgentsPage";

export const Route = createFileRoute("/_shell/agents")({
  component: AgentsPage,
});
