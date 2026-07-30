import { useCallback, useEffect, useMemo, useState } from "react";

import type { TimelineRow } from "@/features/chat/timeline";
import { ChannelSidebar } from "@/features/chat/ui/ChannelSidebar";
import {
  MessageComposer,
  type ReplyTarget,
} from "@/features/chat/ui/MessageComposer";
import { MessageTimeline } from "@/features/chat/ui/MessageTimeline";
import { RelayStatus } from "@/features/chat/ui/RelayStatus";
import { TypingIndicator } from "@/features/chat/ui/TypingIndicator";
import {
  useChannelActivity,
  useChannelMessages,
  useChannels,
  useToggleReaction,
} from "@/features/chat/use-chat";
import { useReadState } from "@/features/chat/use-read-state";
import { usePresence, useTyping } from "@/features/chat/use-presence";

/** First line of a message, for the reply banner. */
function previewOf(content: string): string {
  const firstLine = content.split("\n")[0] ?? "";
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

export function ChatPage({ channelId }: { channelId: string | null }) {
  const channels = useChannels();
  const timeline = useChannelMessages(channelId);
  const toggleReaction = useToggleReaction();
  const activity = useChannelActivity();
  const readState = useReadState();
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
    channels.data?.find((channel) => channel.id === channelId) ?? null;

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

  const isChannelUnread = useCallback(
    (id: string) => readState.isChannelUnread(id, activity.get(id) ?? null),
    [readState.isChannelUnread, activity],
  );

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
    <div className="flex h-dvh min-h-0">
      <ChannelSidebar
        channels={channels.data ?? []}
        activeChannelId={channelId}
        isLoading={channels.isLoading}
        error={channels.error instanceof Error ? channels.error : null}
        isUnread={isChannelUnread}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">
              {activeChannel ? `#${activeChannel.name}` : "Select a channel"}
            </h1>
            {activeChannel?.topic && (
              <p className="truncate text-2xs text-muted-foreground">
                {activeChannel.topic}
              </p>
            )}
          </div>
          <RelayStatus />
        </header>

        {channelId ? (
          <>
            <MessageTimeline
              rows={timeline.rows}
              loaded={timeline.loaded}
              error={timeline.error}
              actions={{
                statusOf: presence.statusOf,
                onToggleReaction,
                onReply,
                pending: toggleReaction.isPending,
              }}
            />
            <TypingIndicator typists={typing.typists} />
            <MessageComposer
              channelId={channelId}
              channelName={activeChannel?.name ?? channelId}
              replyTo={replyTo}
              onCancelReply={() => setReply(null)}
              onComposing={typing.announce}
              onSent={typing.complete}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">
              Pick a channel to start reading.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
