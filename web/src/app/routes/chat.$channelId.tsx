import { createFileRoute } from "@tanstack/react-router";

import { ChatPage } from "@/features/chat/ui/ChatPage";

export const Route = createFileRoute("/c/$channelId")({
  // `m` anchors the view on one message, so a `buzz://message` deep link can
  // point at it. Unknown values are dropped rather than rejected: a stale or
  // hand-edited link should still open the channel.
  // Returns an optional property rather than `m: string | undefined` so links
  // that don't anchor a message can omit `search` entirely.
  validateSearch: (search: Record<string, unknown>): { m?: string } =>
    typeof search.m === "string" ? { m: search.m } : {},
  component: ChannelRoute,
});

function ChannelRoute() {
  const { channelId } = Route.useParams();
  return <ChatPage channelId={channelId} />;
}
