import { Link } from "@tanstack/react-router";
import { FolderGit2, Inbox, MessageSquare } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { SearchBox } from "@/features/search/ui/SearchBox";
import { useShell } from "@/features/shell/shell-context";
import {
  groupChannels,
  type ChannelGroup,
} from "@/features/shell/lib/channel-groups";
import { SidebarChannelSection } from "@/features/shell/ui/SidebarChannelSection";
import { SidebarProfileCard } from "@/features/shell/ui/SidebarProfileCard";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
} from "@/shared/ui/sidebar";

/**
 * Ragged widths so a loading list reads as names rather than as a table. Fixed
 * rather than random: a width regenerated each render would make the skeleton
 * twitch. Each value is distinct, so it also serves as the row's key.
 */
const SKELETON_WIDTHS = [72, 54, 85, 61, 78, 50];

export function AppSidebar({
  activeChannelId,
  communityName,
  query,
  view,
}: {
  activeChannelId: string | null;
  communityName: string;
  /** The committed search, from the URL. */
  query: string;
  view: "chat" | "inbox";
}) {
  const { channels, channelsError, channelsLoading, stars, unread } =
    useShell();
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<ChannelGroup["key"], boolean>
  >({ starred: false, channels: false, forums: false });

  const toggleCollapsed = useCallback((key: ChannelGroup["key"]) => {
    setCollapsedGroups((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const groups = useMemo(
    () =>
      groupChannels({
        channels,
        starredChannelIds: stars.starredChannelIds,
      }),
    [channels, stars.starredChannelIds],
  );

  const unreadChannelIds = useMemo(
    () =>
      new Set(
        channels
          .filter((channel) => unread.isUnread(channel.id))
          .map((channel) => channel.id),
      ),
    [channels, unread],
  );

  return (
    <Sidebar>
      {/* Search sits above the navigation, as it does in the desktop client:
          it is how a reader gets to a message rather than to a room. */}
      <div
        className="shrink-0 px-4 pb-2 pt-3"
        data-testid="sidebar-pinned-header"
      >
        <SearchBox channelId={activeChannelId} query={query} />
      </div>

      <SidebarHeader className="px-2 pb-0 pt-0">
        <SidebarMenu className="pb-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={view === "inbox"}
              tooltip="Inbox"
            >
              <Link to="/home">
                <Inbox className="size-4" />
                <span>Inbox</span>
              </Link>
            </SidebarMenuButton>
            {unreadChannelIds.size > 0 && (
              <SidebarMenuBadge
                className="right-2 rounded-full bg-primary/15 px-1.5 text-2xs text-primary peer-data-[active=true]/menu-button:bg-sidebar-active-foreground/20 peer-data-[active=true]/menu-button:text-sidebar-active-foreground"
                data-testid="sidebar-inbox-count"
              >
                {Math.min(unreadChannelIds.size, 99)}
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={view === "chat" && activeChannelId === null && !query}
              tooltip="All channels"
            >
              <Link to="/">
                <MessageSquare className="size-4" />
                <span>Channels</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Repositories">
              <Link to="/repos">
                <FolderGit2 className="size-4" />
                <span>Repositories</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* The scroll region is the navigation landmark: it is the channel list,
          and a screen-reader user needs to be able to jump to it. */}
      <SidebarContent aria-label="Channels" role="navigation">
        {channelsLoading ? (
          <div className="p-2" data-testid="sidebar-channels-loading">
            {SKELETON_WIDTHS.map((widthPercent) => (
              <SidebarMenuSkeleton
                key={widthPercent}
                showIcon
                widthPercent={widthPercent}
              />
            ))}
          </div>
        ) : channelsError ? (
          <p className="px-4 py-2 text-xs text-destructive" role="alert">
            {channelsError.message}
          </p>
        ) : (
          groups.map((group) => (
            <SidebarChannelSection
              activeChannelId={activeChannelId}
              channels={group.channels}
              emptyState={
                group.key === "channels"
                  ? "No channels visible to this identity."
                  : undefined
              }
              isCollapsed={collapsedGroups[group.key]}
              isStarred={stars.isStarred}
              key={group.key}
              onToggleCollapsed={() => toggleCollapsed(group.key)}
              onToggleStar={stars.toggleStar}
              testId={`sidebar-group-${group.key}`}
              title={group.title}
              unreadChannelIds={unreadChannelIds}
            />
          ))
        )}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarProfileCard communityName={communityName} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
