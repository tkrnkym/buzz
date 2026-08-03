import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/features/shell/ui/AppShell";
import { RelaySessionProvider } from "@/shared/api/relay-provider";

/**
 * App shell layout route.
 *
 * Holds the relay session and the shell state above every chat-side page, so
 * navigating between channels reuses one authenticated WebSocket instead of
 * reconnecting. Pages outside this layout (invites, the repo browser) keep using
 * the one-shot query client and open no long-lived connection.
 */
export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <RelaySessionProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </RelaySessionProvider>
  );
}
