import { Link } from "@tanstack/react-router";
import { ChevronDown, FileText, Hash, Lock, Star } from "lucide-react";
import type { ReactNode } from "react";

import type { Channel } from "@/features/chat/chat-model";
import { cn } from "@/shared/lib/cn";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar";

const SECTION_LABEL_BUTTON_CLASS =
  "group/section-label flex w-fit max-w-[calc(100%-3rem)] cursor-pointer appearance-none items-center gap-1 text-left transition-colors hover:text-sidebar-foreground focus-visible:text-sidebar-foreground";
/** The chevron is an affordance, not decoration — it appears on approach. */
const SECTION_LABEL_CHEVRON_CLASS =
  "relative size-2.5 shrink-0 text-current opacity-0 transition-[color,opacity] group-hover/sidebar-section:opacity-100 group-hover/section-label:opacity-100 group-focus-within/sidebar-section:opacity-100 group-focus-visible/section-label:opacity-100";
const ROW_ACTION_CLASS =
  "absolute right-1 top-1/2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-[4px] p-1 text-sidebar-foreground/45 transition-colors hover:text-sidebar-foreground focus-visible:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4 [&>svg]:shrink-0";
/**
 * The star and the unread badge occupy the same corner. The badge yields on
 * hover so the action is reachable, and takes the corner back otherwise — the
 * count is what matters when the pointer is elsewhere.
 */
const ROW_ACTION_VISIBILITY_CLASS =
  "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 md:opacity-0";
const REPLACED_BADGE_CLASS =
  "md:group-focus-within/menu-item:opacity-0 md:group-hover/menu-item:opacity-0";

function ChannelIcon({ channel }: { channel: Channel }) {
  if (channel.isPrivate) return <Lock className="size-4" />;
  if (channel.type === "forum") return <FileText className="size-4" />;
  return <Hash className="size-4" />;
}

function UnreadDot({ channelName }: { channelName: string }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full bg-primary"
      data-testid={`channel-unread-dot-${channelName}`}
    >
      {/* The dot is decoration; the state is announced as text so a screen
          reader hears it rather than skipping a bare span. */}
      <span className="sr-only">unread</span>
    </span>
  );
}

/**
 * One collapsible heading and the channel rows under it.
 *
 * A row is a `<Link>` rather than a button with a click handler: the sidebar's
 * whole job is navigation, and a link is what makes middle-click, ⌘-click, and
 * "copy link address" work without any code of ours.
 */
export function SidebarChannelSection({
  action,
  activeChannelId,
  channels,
  emptyState,
  isCollapsed,
  isStarred,
  onToggleCollapsed,
  onToggleStar,
  testId,
  title,
  unreadChannelIds,
}: {
  action?: ReactNode;
  activeChannelId: string | null;
  channels: Channel[];
  emptyState?: ReactNode;
  isCollapsed: boolean;
  isStarred: (channelId: string) => boolean;
  onToggleCollapsed: () => void;
  onToggleStar: (channelId: string) => void;
  testId: string;
  title: string;
  unreadChannelIds: ReadonlySet<string>;
}) {
  if (channels.length === 0 && !emptyState) return null;

  const contentId = `sidebar-${testId}`;

  return (
    <SidebarGroup className="group/sidebar-section select-none">
      <div className="relative">
        <SidebarGroupLabel asChild>
          <button
            aria-controls={contentId}
            aria-expanded={!isCollapsed}
            className={SECTION_LABEL_BUTTON_CLASS}
            data-testid={`${testId}-section-label`}
            onClick={onToggleCollapsed}
            type="button"
          >
            <span>{title}</span>
            <span aria-hidden className={SECTION_LABEL_CHEVRON_CLASS}>
              <ChevronDown
                className={cn(
                  "absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2",
                  isCollapsed ? "-rotate-90" : "rotate-0",
                )}
              />
            </span>
          </button>
        </SidebarGroupLabel>
        {action}
      </div>

      {!isCollapsed && (
        <SidebarGroupContent id={contentId}>
          {channels.length > 0 ? (
            <SidebarMenu data-testid={testId}>
              {channels.map((channel) => {
                const isActive = channel.id === activeChannelId;
                // The open channel is being read right now, so it never shows a
                // badge — even before the read cursor round-trips to the relay.
                const hasUnread = !isActive && unreadChannelIds.has(channel.id);
                const starred = isStarred(channel.id);

                return (
                  <SidebarMenuItem key={channel.id}>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        !isActive &&
                          hasUnread &&
                          "font-semibold text-sidebar-foreground hover:text-sidebar-foreground",
                      )}
                      isActive={isActive}
                      tooltip={channel.name}
                    >
                      <Link
                        data-channel-id={channel.id}
                        data-testid={`channel-${channel.name}`}
                        params={{ channelId: channel.id }}
                        title={channel.about ?? channel.name}
                        to="/c/$channelId"
                      >
                        <ChannelIcon channel={channel} />
                        <span className="min-w-0 flex-1 truncate">
                          {channel.name}
                        </span>
                      </Link>
                    </SidebarMenuButton>

                    {hasUnread && (
                      <span
                        className={cn(
                          "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 transition-opacity",
                          REPLACED_BADGE_CLASS,
                        )}
                      >
                        <UnreadDot channelName={channel.name} />
                      </span>
                    )}

                    <button
                      aria-label={
                        starred
                          ? `Unstar ${channel.name}`
                          : `Star ${channel.name}`
                      }
                      aria-pressed={starred}
                      className={cn(
                        ROW_ACTION_CLASS,
                        ROW_ACTION_VISIBILITY_CLASS,
                        starred && "text-primary md:opacity-100",
                      )}
                      data-testid={`star-channel-${channel.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleStar(channel.id);
                      }}
                      type="button"
                    >
                      <Star className={cn(starred && "fill-current")} />
                    </button>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          ) : (
            <div
              className="px-2 py-1 text-sm text-sidebar-foreground/60"
              data-testid={`${testId}-empty`}
            >
              {emptyState}
            </div>
          )}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}
