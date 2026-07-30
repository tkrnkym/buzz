import { useCallback, useState } from "react";

import type { TimelineRow } from "@/features/chat/timeline";
import { ChannelSidebar } from "@/features/chat/ui/ChannelSidebar";
import {
  MessageComposer,
  type ReplyTarget,
} from "@/features/chat/ui/MessageComposer";
import { MessageTimeline } from "@/features/chat/ui/MessageTimeline";
import { RelayStatus } from "@/features/chat/ui/RelayStatus";
import {
  useChannelMessages,
  useChannels,
  useToggleReaction,
} from "@/features/chat/use-chat";

/** First line of a message, for the reply banner. */
function previewOf(content: string): string {
  const firstLine = content.split("\n")[0] ?? "";
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

export function ChatPage({ channelId }: { channelId: string | null }) {
  const channels = useChannels();
  const timeline = useChannelMessages(channelId);
  const toggleReaction = useToggleReaction();
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
                onToggleReaction,
                onReply,
                pending: toggleReaction.isPending,
              }}
            />
            <MessageComposer
              channelId={channelId}
              channelName={activeChannel?.name ?? channelId}
              replyTo={replyTo}
              onCancelReply={() => setReply(null)}
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
