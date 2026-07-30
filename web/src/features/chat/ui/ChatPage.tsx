import { ChannelSidebar } from "@/features/chat/ui/ChannelSidebar";
import { MessageComposer } from "@/features/chat/ui/MessageComposer";
import { MessageTimeline } from "@/features/chat/ui/MessageTimeline";
import { RelayStatus } from "@/features/chat/ui/RelayStatus";
import { useChannelMessages, useChannels } from "@/features/chat/use-chat";

export function ChatPage({ channelId }: { channelId: string | null }) {
  const channels = useChannels();
  const timeline = useChannelMessages(channelId);
  const activeChannel =
    channels.data?.find((channel) => channel.id === channelId) ?? null;

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
              messages={timeline.messages}
              loaded={timeline.loaded}
              error={timeline.error}
            />
            <MessageComposer
              channelId={channelId}
              channelName={activeChannel?.name ?? channelId}
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
