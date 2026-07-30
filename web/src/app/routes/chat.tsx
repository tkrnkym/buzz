import { Outlet, createFileRoute } from "@tanstack/react-router";

import { RelaySessionProvider } from "@/shared/api/relay-provider";

/**
 * Chat layout route.
 *
 * The relay session lives here rather than in each leaf so navigating between
 * channels reuses one authenticated WebSocket instead of reconnecting. Pages
 * outside `/c` keep using the one-shot query client, so visiting an invite or
 * repo page opens no long-lived connection.
 */
export const Route = createFileRoute("/c")({
  component: ChatLayout,
});

function ChatLayout() {
  return (
    <RelaySessionProvider>
      <Outlet />
    </RelaySessionProvider>
  );
}
