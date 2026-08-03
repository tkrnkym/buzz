import { Link } from "@tanstack/react-router";
import { CheckCheck, FileText, Hash, Inbox, Lock } from "lucide-react";
import { useMemo } from "react";

import type { Channel } from "@/features/chat/chat-model";
import { buildInbox } from "@/features/home/inbox";
import { useShell } from "@/features/shell/shell-context";
import { relativeTime } from "@/shared/lib/relative-time";
import { SidebarTrigger } from "@/shared/ui/sidebar";
import { Skeleton } from "@/shared/ui/skeleton";

function RowIcon({ channel }: { channel: Channel }) {
  if (channel.isPrivate) return <Lock aria-hidden className="size-4" />;
  if (channel.type === "forum")
    return <FileText aria-hidden className="size-4" />;
  return <Hash aria-hidden className="size-4" />;
}

/**
 * The Inbox: rooms that moved since the reader last read them.
 *
 * Room-level rather than message-level, because room-level is what this client
 * can state truthfully today — the relay publishes per-channel activity
 * snapshots, and the reader's cursors say where they stopped. A mention list
 * needs the messages module, and inventing one from partial data would be worse
 * than not having it.
 */
export function InboxPage() {
  const { channels, channelsLoading, readState, unread } = useShell();

  const rows = useMemo(
    () =>
      buildInbox({
        channels,
        isUnread: unread.isUnread,
        lastActivityAt: unread.lastActivityAt,
      }),
    [channels, unread],
  );

  const isLoading = channelsLoading || unread.isLoading;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <SidebarTrigger className="md:-ml-1" />
        <h1 className="flex items-center gap-2 text-sm font-semibold">
          <Inbox aria-hidden className="size-4" />
          Inbox
        </h1>
        {!isLoading && rows.length > 0 && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-2xs font-semibold text-primary">
            {rows.length}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <ul className="flex flex-col gap-1 p-4">
            {[80, 62, 71].map((width) => (
              <li className="flex items-center gap-3 px-2 py-3" key={width}>
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4" style={{ width: `${width}%` }} />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <CheckCheck aria-hidden className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">You are all caught up</p>
            <p className="max-w-sm text-2xs text-muted-foreground">
              {readState.canSync
                ? "Rooms appear here when they have messages newer than your read position."
                : "This signer cannot encrypt, so read positions are not being saved — every room will keep looking unread."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col p-2" data-testid="inbox-rows">
            {rows.map(({ channel, lastActivityAt }) => (
              <li key={channel.id}>
                <Link
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent hover:text-accent-foreground"
                  data-testid={`inbox-row-${channel.name}`}
                  params={{ channelId: channel.id }}
                  to="/c/$channelId"
                >
                  <span className="shrink-0 text-muted-foreground">
                    <RowIcon channel={channel} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">
                      {channel.name}
                    </span>
                    {(channel.topic ?? channel.about) && (
                      <span className="truncate text-2xs text-muted-foreground">
                        {channel.topic ?? channel.about}
                      </span>
                    )}
                  </span>
                  {lastActivityAt !== null && (
                    <span className="shrink-0 text-2xs text-muted-foreground">
                      {relativeTime(lastActivityAt)}
                    </span>
                  )}
                  <span className="size-2 shrink-0 rounded-full bg-primary">
                    <span className="sr-only">unread</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
