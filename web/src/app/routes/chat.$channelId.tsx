import { createFileRoute } from "@tanstack/react-router";

import { ChatPage } from "@/features/chat/ui/ChatPage";

export const Route = createFileRoute("/c/$channelId")({
  // `m` anchors the view on one message, so a `buzz://message` deep link can
  // point at it. `q` puts a search in the URL, so a result set is linkable and
  // survives a reload.
  //
  // Unknown values are dropped rather than rejected: a stale or hand-edited link
  // should still open the channel. Both are returned as optional properties
  // rather than `string | undefined` so a link that uses neither can omit
  // `search` entirely.
  validateSearch: (
    search: Record<string, unknown>,
  ): { m?: string; q?: string } => ({
    ...(typeof search.m === "string" ? { m: search.m } : {}),
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
  }),
  component: ChannelRoute,
});

function ChannelRoute() {
  const { channelId } = Route.useParams();
  const { q } = Route.useSearch();
  return <ChatPage channelId={channelId} query={q ?? ""} />;
}
