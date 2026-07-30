import { createFileRoute } from "@tanstack/react-router";

import { ChatPage } from "@/features/chat/ui/ChatPage";

export const Route = createFileRoute("/c/$channelId")({
  component: ChannelRoute,
});

function ChannelRoute() {
  const { channelId } = Route.useParams();
  return <ChatPage channelId={channelId} />;
}
