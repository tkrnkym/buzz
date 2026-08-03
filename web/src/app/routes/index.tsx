import { createFileRoute } from "@tanstack/react-router";

import { ChatPage } from "@/features/chat/ui/ChatPage";

/** The top page is chat. The repo browser it replaced lives at `/repos`. */
export const Route = createFileRoute("/_shell/")({
  // Search works before a channel is chosen — the community-wide case is the
  // one where it matters most.
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
  component: ChatIndexRoute,
});

function ChatIndexRoute() {
  const { q } = Route.useSearch();
  return <ChatPage channelId={null} query={q ?? ""} />;
}
