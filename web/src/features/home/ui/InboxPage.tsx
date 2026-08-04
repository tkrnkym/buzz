import { CheckCheck, FileText, Hash, Inbox, Lock } from "lucide-react";
import { useMemo, useState } from "react";

import type { Channel } from "@/features/chat/chat-model";
import { buildInbox } from "@/features/home/inbox";
import {
  resolveSelection,
  sameSelection,
  type InboxSelection,
} from "@/features/home/inbox-selection";
import { InboxDetail } from "@/features/home/ui/InboxDetail";
import { NotificationList } from "@/features/notifications/ui/NotificationList";
import { useNotifications } from "@/features/notifications/use-notifications";
import { useShell } from "@/features/shell/shell-context";
import { cn } from "@/shared/lib/cn";
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
 * The Inbox: what was addressed to this reader, and which rooms moved.
 *
 * Two panes. The left one is the list — notifications first, because a message
 * with your name on it is the more urgent of the two, then the rooms the relay
 * says have moved. The right one shows whichever row is selected.
 *
 * The pane is what the rows used to be links to. An inbox is for triage, and
 * triage means reading one thing and deciding: with links, reading a mention cost
 * the reader the list they were working through and landed them in a busy channel
 * with no way back to where they were. The way out to the channel still exists,
 * still anchored on the message rather than the room — it just lives in the pane
 * now, taken after reading rather than before.
 *
 * Below `md` the two stack, list above detail, rather than the detail being
 * dropped: on a phone the pane is the only way to read a mention at all.
 *
 * The two row kinds are built from different things and stay distinguishable. The
 * notification list is message-level — mentions, DMs and replies, from three real
 * filters (see `notifications-model`). The room list is built from the relay's
 * per-channel activity snapshots and the reader's own cursors, which say a room
 * moved and nothing about who said what.
 */
export function InboxPage() {
  const { channels, channelsLoading, readState, unread } = useShell();
  const { items } = useNotifications();
  const [chosen, setChosen] = useState<InboxSelection | null>(null);

  const rows = useMemo(
    () =>
      buildInbox({
        channels,
        isUnread: unread.isUnread,
        lastActivityAt: unread.lastActivityAt,
      }),
    [channels, unread],
  );

  // Derived rather than stored: the list is live, so a selection made a moment
  // ago can name a mention that has since scrolled past the visible window or a
  // room that was read in another tab.
  const selection = resolveSelection({
    current: chosen,
    notificationIds: items.map((item) => item.id),
    roomIds: rows.map((row) => row.channel.id),
  });
  const selectedItem =
    selection?.kind === "notification"
      ? (items.find((item) => item.id === selection.id) ?? null)
      : null;
  const selectedRoom =
    selection?.kind === "room"
      ? (rows.find((row) => row.channel.id === selection.channelId) ?? null)
      : null;

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

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          className="min-h-0 shrink-0 overflow-y-auto border-b border-border md:w-96 md:border-b-0 md:border-r"
          data-testid="inbox-list"
        >
          <section className="border-b border-border px-3 py-4">
            <NotificationList
              onSelect={(id) => setChosen({ kind: "notification", id })}
              selectedId={
                selection?.kind === "notification" ? selection.id : null
              }
            />
          </section>

          <h2 className="px-3 pt-4 text-2xs font-semibold text-muted-foreground">
            動きのあった部屋
          </h2>
          {isLoading ? (
            <ul className="flex flex-col gap-1 p-3">
              {[80, 62, 71].map((width) => (
                <li className="flex items-center gap-3 px-2 py-3" key={width}>
                  <Skeleton className="size-4 rounded" />
                  <Skeleton className="h-4" style={{ width: `${width}%` }} />
                </li>
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
              <CheckCheck
                aria-hidden
                className="size-8 text-muted-foreground"
              />
              <p className="text-sm font-medium">You are all caught up</p>
              <p className="max-w-sm text-2xs text-muted-foreground">
                {readState.canSync
                  ? "Rooms appear here when they have messages newer than your read position."
                  : "This signer cannot encrypt, so read positions are not being saved — every room will keep looking unread."}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col p-2" data-testid="inbox-rows">
              {rows.map(({ channel, lastActivityAt }) => {
                // Compared through the model rather than on the id alone: a
                // notification id and a channel id are different namespaces, and
                // a bare string match would light the wrong row.
                const active = sameSelection(selection, {
                  kind: "room",
                  channelId: channel.id,
                });
                return (
                  <li key={channel.id}>
                    <button
                      aria-current={active}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                      data-testid={`inbox-row-${channel.name}`}
                      onClick={() =>
                        setChosen({ kind: "room", channelId: channel.id })
                      }
                      type="button"
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
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4"
          data-testid="inbox-detail"
        >
          <InboxDetail
            channels={channels}
            item={selectedItem}
            lastActivityAt={selectedRoom?.lastActivityAt ?? null}
            selection={selection}
          />
        </div>
      </div>
    </section>
  );
}
