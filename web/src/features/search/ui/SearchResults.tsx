import { Link } from "@tanstack/react-router";

import type { Channel } from "@/features/chat/chat-model";
import { excerpt } from "@/features/search/search-model";
import { useSearch } from "@/features/search/use-search";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { relativeTime } from "@/shared/lib/relative-time";

/**
 * Search results for the current query.
 *
 * Rows render an excerpt as plain text rather than through the markdown
 * renderer. A result list is for scanning, and a hit whose body is a table, a
 * code block, or an image would otherwise take over the list — the message
 * itself is one click away.
 */
export function SearchResults({
  query,
  channels,
  scopeChannelId,
}: {
  query: string;
  channels: Channel[];
  /** When set, results are limited to this channel. */
  scopeChannelId: string | null;
}) {
  const search = useSearch(query, scopeChannelId);
  const nameOf = (channelId: string | null) =>
    channels.find((channel) => channel.id === channelId)?.name ?? null;

  if (search.error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="max-w-md text-center text-sm text-destructive">
          {search.error}
        </p>
      </div>
    );
  }

  if (search.hits.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          {search.isLoading ? "Searching…" : `No messages match “${query}”.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <ul className="flex flex-col">
        {search.hits.map((hit) => {
          const channelName = nameOf(hit.channelId);
          return (
            <li key={hit.id} className="border-b border-border last:border-0">
              {hit.channelId ? (
                <Link
                  to="/c/$channelId"
                  params={{ channelId: hit.channelId }}
                  // Anchors the timeline on this message, the same parameter a
                  // `buzz://message` deep link uses.
                  search={{ m: hit.id }}
                  className="block px-4 py-2 hover:bg-secondary"
                >
                  <HitBody
                    hit={hit}
                    query={query}
                    channelName={channelName ?? hit.channelId}
                  />
                </Link>
              ) : (
                // A hit with no `h` tag has no channel to open — forum posts
                // reachable elsewhere. Shown, but not as a dead link.
                <div className="px-4 py-2">
                  <HitBody hit={hit} query={query} channelName={null} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {search.hasMore && (
        <div className="flex justify-center py-3">
          <button
            type="button"
            onClick={search.loadMore}
            disabled={search.isLoading}
            className="rounded-md px-3 py-1 text-2xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            {search.isLoading ? "Loading…" : "More results"}
          </button>
        </div>
      )}
    </div>
  );
}

function HitBody({
  hit,
  query,
  channelName,
}: {
  hit: { pubkey: string; createdAt: number; content: string };
  query: string;
  channelName: string | null;
}) {
  return (
    <>
      <div className="flex items-baseline gap-2">
        {channelName && (
          <span className="text-2xs font-semibold text-muted-foreground">
            #{channelName}
          </span>
        )}
        <span className="text-2xs">{truncatePubkey(hit.pubkey)}</span>
        <time
          className="text-2xs text-muted-foreground"
          dateTime={new Date(hit.createdAt * 1000).toISOString()}
        >
          {relativeTime(hit.createdAt)}
        </time>
      </div>
      <p className="mt-0.5 line-clamp-2 text-sm">
        {excerpt(hit.content, query)}
      </p>
    </>
  );
}
