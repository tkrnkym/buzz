import { Link } from "@tanstack/react-router";
import { Hash } from "lucide-react";

import nuxxAppIcon from "@/assets/app-icon@3x.png";
import { useShell } from "@/features/shell/shell-context";

/**
 * What the content pane shows before a channel is chosen.
 *
 * Not a bare "pick a channel" line: on a first visit this is the only screen a
 * reader sees, so it names the community and offers the rooms directly. The
 * sidebar can be collapsed or off-canvas, in which case a prompt pointing left
 * would point at nothing.
 */
export function ChannelWelcome() {
  const { channels, channelsLoading, unread } = useShell();
  const suggestions = channels
    .filter((channel) => !channel.isPrivate)
    .slice(0, 6);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div
          className="size-14 overflow-hidden bg-black"
          style={{ borderRadius: "22.37%" }}
        >
          <img alt="" className="size-full" src={nuxxAppIcon} />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Welcome to nuxx</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a channel to start reading, or open one below.
        </p>

        {!channelsLoading && suggestions.length > 0 && (
          <ul className="mt-6 flex w-full flex-col gap-1">
            {suggestions.map((channel) => (
              <li key={channel.id}>
                <Link
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  params={{ channelId: channel.id }}
                  to="/c/$channelId"
                >
                  <Hash aria-hidden className="size-3.5 shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1 truncate">
                    {channel.name}
                  </span>
                  {channel.topic && (
                    <span className="hidden min-w-0 max-w-40 truncate text-2xs text-muted-foreground sm:block">
                      {channel.topic}
                    </span>
                  )}
                  {/* Last, and always the same width, so the topics above line
                      up whether or not a room is unread. */}
                  <span className="size-2 shrink-0">
                    {unread.isUnread(channel.id) && (
                      <span className="block size-2 rounded-full bg-primary">
                        <span className="sr-only">unread</span>
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
