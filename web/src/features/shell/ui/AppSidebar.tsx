import { Link, useNavigate } from "@tanstack/react-router";
import { FolderGit2, Inbox, MessageSquare, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type { Channel } from "@/features/chat/chat-model";
import { useMyPubkey } from "@/features/chat/use-chat";
import { resolveChannelLabel } from "@/features/channels/dm-label";
import { CreateChannelDialog } from "@/features/channels/ui/CreateChannelDialog";
import { NewDmDialog } from "@/features/channels/ui/NewDmDialog";
import {
  useCreateChannel,
  useLeaveChannel,
  useOpenDm,
} from "@/features/channels/use-channel-ops";
import { useProfiles } from "@/features/profile/profile-store";
import { SearchBox } from "@/features/search/ui/SearchBox";
import {
  groupChannels,
  type ChannelGroup,
} from "@/features/shell/lib/channel-groups";
import { useShell } from "@/features/shell/shell-context";
import {
  SidebarChannelSection,
  type ChannelRowActions,
} from "@/features/shell/ui/SidebarChannelSection";
import { SidebarProfileCard } from "@/features/shell/ui/SidebarProfileCard";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroupAction,
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
  view: "chat" | "inbox" | "settings";
}) {
  const {
    channels,
    channelsError,
    channelsLoading,
    dms,
    mutes,
    stars,
    unread,
  } = useShell();
  const navigate = useNavigate();
  const myPubkey = useMyPubkey();
  const createChannel = useCreateChannel();
  const leaveChannel = useLeaveChannel();
  const openDm = useOpenDm();
  const [createOpen, setCreateOpen] = useState(false);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<ChannelGroup["key"] | "dms", boolean>
  >({ starred: false, channels: false, forums: false, dms: false });

  const toggleCollapsed = useCallback((key: ChannelGroup["key"] | "dms") => {
    setCollapsedGroups((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const groups = useMemo(
    () =>
      groupChannels({
        channels,
        starredChannelIds: stars.channelIds,
      }),
    [channels, stars.channelIds],
  );

  // Only DM participants need resolving here: a channel's own name is on its
  // metadata, and the profile card asks for the reader separately.
  const dmParticipants = useMemo(
    () => dms.flatMap((dm) => dm.participantPubkeys),
    [dms],
  );
  const profiles = useProfiles(dmParticipants);

  const labelFor = useCallback(
    (channel: Channel) =>
      resolveChannelLabel({ channel, currentPubkey: myPubkey, profiles }),
    [myPubkey, profiles],
  );

  const unreadChannelIds = useMemo(
    () =>
      new Set(
        [...channels, ...dms]
          .filter((channel) => unread.isUnread(channel.id))
          .map((channel) => channel.id),
      ),
    [channels, dms, unread],
  );

  const rowActions = useMemo<ChannelRowActions>(
    () => ({
      isMuted: mutes.has,
      isStarred: stars.has,
      labelFor,
      profiles,
      onCopyLink: (channel) => {
        const url = new URL(
          `/c/${channel.id}`,
          window.location.origin,
        ).toString();
        void navigator.clipboard
          .writeText(url)
          .then(() => toast.success("Link copied"))
          .catch(() => toast.error("Could not copy the link"));
      },
      onLeave: (channel) =>
        leaveChannel.mutate(channel.id, {
          onSuccess: () => {
            toast.success(`Left ${labelFor(channel)}`);
            // Leaving the room being read would leave the reader looking at a
            // timeline they can no longer load.
            if (channel.id === activeChannelId) void navigate({ to: "/" });
          },
          onError: (error) =>
            toast.error(
              error instanceof Error ? error.message : "Could not leave",
            ),
        }),
      onToggleMute: mutes.toggle,
      onToggleStar: stars.toggle,
    }),
    [
      activeChannelId,
      labelFor,
      leaveChannel,
      mutes.has,
      mutes.toggle,
      navigate,
      profiles,
      stars.has,
      stars.toggle,
    ],
  );

  return (
    <Sidebar>
      {createOpen && (
        <CreateChannelDialog
          error={
            createChannel.error instanceof Error
              ? createChannel.error.message
              : null
          }
          onClose={() => setCreateOpen(false)}
          onCreate={(input) =>
            createChannel.mutate(input, {
              onSuccess: ({ channelId }) => {
                setCreateOpen(false);
                void navigate({
                  to: "/c/$channelId",
                  params: { channelId },
                });
              },
            })
          }
          pending={createChannel.isPending}
        />
      )}

      {newDmOpen && (
        <NewDmDialog
          error={openDm.error instanceof Error ? openDm.error.message : null}
          onClose={() => setNewDmOpen(false)}
          onOpen={(pubkeys) =>
            openDm.mutate(pubkeys, {
              onSuccess: () => {
                setNewDmOpen(false);
                // The relay allocates the channel and answers with its metadata,
                // so there is no id to navigate to — the DM appears in the list
                // once that lands.
                toast.success("Direct message opened");
              },
            })
          }
          pending={openDm.isPending}
        />
      )}

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
          <>
            {groups.map((group) => (
              <SidebarChannelSection
                action={
                  group.key === "channels" ? (
                    <SidebarGroupAction
                      aria-label="Create a channel"
                      data-testid="open-create-channel"
                      onClick={() => setCreateOpen(true)}
                    >
                      <Plus />
                    </SidebarGroupAction>
                  ) : undefined
                }
                activeChannelId={activeChannelId}
                channels={group.channels}
                emptyState={
                  group.key === "channels"
                    ? "No channels visible to this identity."
                    : undefined
                }
                isCollapsed={collapsedGroups[group.key]}
                key={group.key}
                onToggleCollapsed={() => toggleCollapsed(group.key)}
                rowActions={rowActions}
                testId={`sidebar-group-${group.key}`}
                title={group.title}
                unreadChannelIds={unreadChannelIds}
              />
            ))}

            <SidebarChannelSection
              action={
                <SidebarGroupAction
                  aria-label="New direct message"
                  data-testid="open-new-dm"
                  onClick={() => setNewDmOpen(true)}
                >
                  <Plus />
                </SidebarGroupAction>
              }
              activeChannelId={activeChannelId}
              channels={dms}
              emptyState="No direct messages yet."
              isCollapsed={collapsedGroups.dms}
              onToggleCollapsed={() => toggleCollapsed("dms")}
              rowActions={rowActions}
              testId="sidebar-group-dms"
              title="Direct messages"
              unreadChannelIds={unreadChannelIds}
            />
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarProfileCard communityName={communityName} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
