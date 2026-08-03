import { createFileRoute } from "@tanstack/react-router";

import { ChannelBrowserPage } from "@/features/channels/ui/ChannelBrowserPage";

export const Route = createFileRoute("/_shell/browse")({
  component: ChannelBrowserPage,
});
