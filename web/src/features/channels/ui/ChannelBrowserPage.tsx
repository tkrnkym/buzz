import { Link } from "@tanstack/react-router";
import { Hash, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { searchChannels } from "@/features/channels/channel-browser";
import { useChannelBrowser } from "@/features/channels/use-channel-browser";
import { useJoinChannel } from "@/features/channels/use-channel-ops";
import type { Channel } from "@/features/chat/chat-model";
import { Skeleton } from "@/shared/ui/skeleton";
import { SidebarTrigger } from "@/shared/ui/sidebar";

function ChannelCard({
  action,
  channel,
}: {
  action: React.ReactNode;
  channel: Channel;
}) {
  return (
    <li
      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
      data-testid={`browse-channel-${channel.name}`}
    >
      {channel.isPrivate ? (
        <Lock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Hash aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{channel.name}</p>
        {(channel.about || channel.topic) && (
          <p className="truncate text-2xs text-muted-foreground">
            {channel.about || channel.topic}
          </p>
        )}
      </div>
      {action}
    </li>
  );
}

/**
 * Find a room and join it.
 *
 * The list is every open channel the relay serves, minus the ones this reader is
 * already in. Private rooms are absent: their metadata is visible but a join
 * would be refused, and an invite is how they are entered — offering a button
 * that fails is worse than offering nothing.
 */
export function ChannelBrowserPage() {
  const { joined, available, loading } = useChannelBrowser();
  const joinChannel = useJoinChannel();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const hits = useMemo(
    () => searchChannels(available, query),
    [available, query],
  );
  const joinedHits = useMemo(
    () => searchChannels(joined, query),
    [joined, query],
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <SidebarTrigger className="md:-ml-1" />
        <h1 className="text-sm font-semibold">Browse channels</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          <input
            aria-label="Search channels"
            autoComplete="off"
            className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid="browse-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, topic or description"
            value={query}
          />

          {loading ? (
            <div className="mt-4 flex flex-col gap-2">
              {["70%", "55%", "62%"].map((width) => (
                <Skeleton className="h-12" key={width} style={{ width }} />
              ))}
            </div>
          ) : (
            <>
              <h2 className="mt-6 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                Not joined
              </h2>
              {hits.length > 0 ? (
                <ul
                  className="mt-2 flex flex-col gap-2"
                  data-testid="browse-available"
                >
                  {hits.map((channel) => (
                    <ChannelCard
                      action={
                        <button
                          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                          data-testid={`browse-join-${channel.name}`}
                          disabled={pendingId !== null}
                          onClick={() => {
                            setPendingId(channel.id);
                            joinChannel.mutate(channel.id, {
                              onSuccess: () =>
                                toast.success(`Joined ${channel.name}`),
                              onError: (error) =>
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Could not join",
                                ),
                              onSettled: () => setPendingId(null),
                            });
                          }}
                          type="button"
                        >
                          {pendingId === channel.id ? "Joining…" : "Join"}
                        </button>
                      }
                      channel={channel}
                      key={channel.id}
                    />
                  ))}
                </ul>
              ) : (
                <p
                  className="mt-2 text-2xs text-muted-foreground"
                  data-testid="browse-available-empty"
                >
                  {query
                    ? "No open channel matches that."
                    : "You are in every open channel here."}
                </p>
              )}

              <h2 className="mt-8 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                Already joined
              </h2>
              <ul
                className="mt-2 flex flex-col gap-2"
                data-testid="browse-joined"
              >
                {joinedHits.map((channel) => (
                  <ChannelCard
                    action={
                      <Link
                        className="shrink-0 rounded-md border border-border px-3 py-1.5 text-2xs font-medium hover:bg-accent"
                        params={{ channelId: channel.id }}
                        to="/c/$channelId"
                      >
                        Open
                      </Link>
                    }
                    channel={channel}
                    key={channel.id}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
