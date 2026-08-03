import { useLocation, useParams, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ProfileStoreProvider } from "@/features/profile/profile-store";
import { ShowcaseStoreProvider } from "@/features/showcase/showcase-store";
import { ShellProvider, useShell } from "@/features/shell/shell-context";
import { AppSidebar } from "@/features/shell/ui/AppSidebar";
import { resolveShellView } from "@/features/shell/lib/shell-view";
import { CommunityRail } from "@/features/shell/ui/CommunityRail";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { SidebarInset, SidebarProvider } from "@/shared/ui/sidebar";

/** The community's display name: the relay's host, which is what it is. */
function communityNameFromRelay(): string {
  try {
    return new URL(relayWsUrl()).host;
  } catch {
    return "nuxx";
  }
}

/**
 * Rail + sidebar + content, ported from the desktop client's `AppShell`.
 *
 * The shell is a layout route rather than a wrapper each page renders, which is
 * what lets one authenticated WebSocket and one set of read cursors survive
 * navigation between channels. A per-page wrapper would tear both down and
 * rebuild them on every click.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    // The profile cache sits above the shell so a name resolved for the sidebar
    // is the same object the timeline reads — one fetch per identity, not one
    // per surface that mentions them.
    <ProfileStoreProvider>
      {/* The mock-up fixtures, above the shell so something created on the
          Workflows screen is still there after navigating to its detail page. */}
      <ShowcaseStoreProvider>
        <ShellProvider>
          <AppShellFrame>{children}</AppShellFrame>
        </ShellProvider>
      </ShowcaseStoreProvider>
    </ProfileStoreProvider>
  );
}

function AppShellFrame({ children }: { children: ReactNode }) {
  const { channels, unread } = useShell();
  // Non-strict: the shell renders above several routes, only one of which has a
  // `channelId` or a `q`. Asking strictly would have to know which.
  const { channelId } = useParams({ strict: false }) as { channelId?: string };
  const { q } = useSearch({ strict: false }) as { q?: string };
  const view = resolveShellView(useLocation().pathname);
  const communityName = communityNameFromRelay();
  const hasUnread = channels.some((channel) => unread.isUnread(channel.id));

  return (
    <div className="flex h-dvh min-h-0">
      <CommunityRail communityName={communityName} hasUnread={hasUnread} />
      <SidebarProvider className="min-w-0 flex-1">
        <AppSidebar
          activeChannelId={channelId ?? null}
          communityName={communityName}
          query={q ?? ""}
          view={view}
        />
        <SidebarInset className="min-h-0">{children}</SidebarInset>
      </SidebarProvider>
    </div>
  );
}
