import { Link } from "@tanstack/react-router";
import { Hash, Lock } from "lucide-react";

import type { Channel } from "@/features/chat/chat-model";
import { cn } from "@/shared/lib/cn";

/**
 * Channel list rail.
 *
 * Fixed 16rem so it scales with the root font size rather than freezing against
 * browser zoom, matching the desktop sidebar's proportions.
 */
export function ChannelSidebar({
  channels,
  activeChannelId,
  isLoading,
  error,
  isUnread,
}: {
  channels: Channel[];
  activeChannelId: string | null;
  isLoading: boolean;
  error: Error | null;
  isUnread: (channelId: string) => boolean;
}) {
  return (
    <nav
      aria-label="Channels"
      className="flex w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-sidebar-border bg-sidebar p-2 text-sidebar-foreground"
    >
      <h2 className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        Channels
      </h2>

      {isLoading && (
        <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>
      )}

      {error && (
        <p className="px-2 py-1 text-xs text-destructive">{error.message}</p>
      )}

      {!isLoading && !error && channels.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          No channels visible to this identity.
        </p>
      )}

      {channels.map((channel) => {
        const isActive = channel.id === activeChannelId;
        // The open channel is being read right now, so it never shows a badge
        // even before the cursor round-trips to the relay.
        const unread = !isActive && isUnread(channel.id);
        return (
          <Link
            key={channel.id}
            to="/c/$channelId"
            params={{ channelId: channel.id }}
            aria-current={isActive ? "page" : undefined}
            title={channel.about ?? channel.name}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-sidebar-active text-sidebar-active-foreground"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            {channel.isPrivate ? (
              <Lock aria-hidden className="size-3.5 shrink-0 opacity-70" />
            ) : (
              <Hash aria-hidden className="size-3.5 shrink-0 opacity-70" />
            )}
            <span className={cn("truncate", unread && "font-semibold")}>
              {channel.name}
            </span>
            {unread && (
              <>
                {/* The dot is decoration; the state is announced as text so a
                    screen reader hears it rather than skipping a bare span. */}
                <span className="sr-only">Unread messages</span>
                <span
                  aria-hidden
                  className="ml-auto size-1.5 shrink-0 rounded-full bg-primary"
                />
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
