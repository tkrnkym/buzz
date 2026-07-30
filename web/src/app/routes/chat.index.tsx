import { createFileRoute } from "@tanstack/react-router";

import { ChatPage } from "@/features/chat/ui/ChatPage";

export const Route = createFileRoute("/c/")({
  component: () => <ChatPage channelId={null} />,
});
