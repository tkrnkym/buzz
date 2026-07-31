import { useCallback, useEffect, useMemo, useState } from "react";

import type { TimelineRow } from "@/features/chat/timeline";
import {
  MessageComposer,
  type ReplyTarget,
} from "@/features/chat/ui/MessageComposer";
import { MessageTimeline } from "@/features/chat/ui/MessageTimeline";
import { ReadStateNotice } from "@/features/chat/ui/ReadStateNotice";
import { RelayStatus } from "@/features/chat/ui/RelayStatus";
import { TypingIndicator } from "@/features/chat/ui/TypingIndicator";
import {
  useChannelMessages,
  useToggleReaction,
} from "@/features/chat/use-chat";
import { usePresence, useTyping } from "@/features/chat/use-presence";
import { SearchResults } from "@/features/search/ui/SearchResults";
import { useShell } from "@/features/shell/shell-context";
import { ChannelWelcome } from "@/features/shell/ui/ChannelWelcome";
import { SidebarTrigger } from "@/shared/ui/sidebar";

/** First line of a message, for the reply banner. */
function previewOf(content: string): string {
  const firstLine = content.split("\n")[0] ?? "";
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

export function ChatPage({
  channelId,
  query = "",
}: {
  channelId: string | null;
  /** Active search, from the URL. Empty means the timeline is showing. */
  query?: string;
}) {
  // Channels, read cursors, and unread state come from the shell so the sidebar
  // and this pane cannot disagree — see `shell-context.tsx`.
  const { channels, readState } = useShell();
  const timeline = useChannelMessages(channelId);
  const toggleReaction = useToggleReaction();
  const typing = useTyping(channelId);
  // Only the authors on screen: presence is read per-author, so asking about
  // everyone would grow the query with the community rather than the viewport.
  const visibleAuthors = useMemo(
    () => timeline.rows.map((row) => row.message.pubkey),
    [timeline.rows],
  );
  const presence = usePresence(visibleAuthors);
  // The reply target is stored with the channel it belongs to and read back only
  // for a match, so switching channels cannot post a reply into a thread that
  // does not exist in the new room — and no render sees a stale target.
  const [reply, setReply] = useState<{
    channelId: string;
    target: ReplyTarget;
  } | null>(null);
  const replyTo = reply?.channelId === channelId ? reply.target : null;

  const activeChannel =
    channels.find((channel) => channel.id === channelId) ?? null;

  // Reading the room marks it read up to its newest message. Driven by the
  // loaded timeline rather than the global activity feed, so the cursor never
  // jumps past a message this client has not actually shown.
  const newestShown =
    timeline.rows.length > 0
      ? timeline.rows[timeline.rows.length - 1].message.createdAt
      : null;
  useEffect(() => {
    if (!channelId || newestShown === null || !timeline.loaded) return;
    readState.markRead(channelId, newestShown);
  }, [channelId, newestShown, timeline.loaded, readState.markRead]);

  // Any author's message ends their typing indicator, not just this client's.
  // Without this someone stays "typing…" for the rest of the TTL after the
  // message they were writing is already on screen.
  const newestRow =
    timeline.rows.length > 0 ? timeline.rows[timeline.rows.length - 1] : null;
  const newestRowId = newestRow?.message.id ?? null;
  const completeTyping = typing.complete;
  useEffect(() => {
    if (!newestRow || newestRowId === null) return;
    completeTyping({
      pubkey: newestRow.message.pubkey,
      threadHeadId: newestRow.message.parentId,
    });
    // Keyed on the id so this fires once per message, not on every re-render.
  }, [newestRowId, newestRow, completeTyping]);

  const onReply = useCallback(
    (row: TimelineRow) => {
      if (!channelId) return;
      setReply({
        channelId,
        target: {
          // Replying to a reply keeps the original thread root, so the thread
          // stays one tree instead of splitting at every level.
          rootId: row.message.rootId ?? row.message.id,
          parentId: row.message.id,
          authorPubkey: row.message.pubkey,
          preview: previewOf(row.content),
        },
      });
    },
    [channelId],
  );

  const onToggleReaction = useCallback(
    (input: { messageId: string; emoji: string; myReactionId?: string }) => {
      toggleReaction.mutate(input);
    },
    [toggleReaction],
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="md:-ml-1" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">
              {query
                ? `Search${activeChannel ? ` in #${activeChannel.name}` : ""}`
                : activeChannel
                  ? `#${activeChannel.name}`
                  : "Channels"}
            </h1>
            {activeChannel?.topic && (
              <p className="truncate text-2xs text-muted-foreground">
                {activeChannel.topic}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ReadStateNotice
            canSync={readState.canSync}
            error={readState.error}
          />
          <RelayStatus />
        </div>
      </header>

      {query ? (
        <SearchResults
          channels={channels}
          query={query}
          scopeChannelId={channelId}
        />
      ) : channelId ? (
        <>
          <MessageTimeline
            actions={{
              statusOf: presence.statusOf,
              onToggleReaction,
              onReply,
              pending: toggleReaction.isPending,
            }}
            error={timeline.error}
            hasMore={timeline.hasMore}
            isLoadingMore={timeline.isLoadingMore}
            loaded={timeline.loaded}
            onLoadOlder={timeline.loadOlder}
            rows={timeline.rows}
          />
          <TypingIndicator typists={typing.typists} />
          <MessageComposer
            channelId={channelId}
            channelName={activeChannel?.name ?? channelId}
            onCancelReply={() => setReply(null)}
            onComposing={typing.announce}
            onSent={typing.complete}
            replyTo={replyTo}
          />
        </>
      ) : (
        <ChannelWelcome />
      )}
    </section>
  );
}
