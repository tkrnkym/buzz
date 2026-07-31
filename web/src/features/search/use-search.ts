/**
 * Search state. See `search-model.ts` for the protocol constraints.
 */

import { useCallback, useEffect, useState } from "react";

import { postRelayQuery } from "@/shared/api/relay-http";
import {
  SEARCH_PAGE_SIZE,
  type SearchHit,
  buildSearchFilter,
  toSearchHits,
} from "@/features/search/search-model";

export interface SearchApi {
  hits: SearchHit[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
}

/**
 * The question currently being asked, and how far into it we are.
 *
 * The query and its page live in one value on purpose. Held separately, a new
 * query and its page reset land in different updates, and the effect in between
 * fires the new question at the old page number — a wasted request whose results
 * are then appended to the wrong list.
 */
interface SearchCursor {
  query: string;
  channelId: string | null;
  page: number;
}

/**
 * Run a search, appending pages.
 *
 * Not debounced, because it runs on submit rather than per keystroke: full-text
 * search across a community is expensive enough that firing it per character
 * would be a load problem as much as a UX one.
 */
export function useSearch(query: string, channelId?: string | null): SearchApi {
  const trimmed = query.trim();
  const scope = channelId ?? null;

  const [cursor, setCursor] = useState<SearchCursor>({
    query: trimmed,
    channelId: scope,
    page: 1,
  });
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // A changed question restarts at page 1. Returning the current value when
  // nothing changed keeps this from re-rendering — and so from re-running the
  // fetch below — on every render.
  useEffect(() => {
    setCursor((current) =>
      current.query === trimmed && current.channelId === scope
        ? current
        : { query: trimmed, channelId: scope, page: 1 },
    );
  }, [trimmed, scope]);

  useEffect(() => {
    if (!cursor.query) {
      setHits([]);
      setHasMore(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    postRelayQuery([
      buildSearchFilter(cursor.query, cursor.page, cursor.channelId),
    ])
      .then((events) => {
        if (cancelled) return;
        // Order is the server's ranking. Appending, never sorting: re-ordering
        // by timestamp would discard the only thing that made these the answer.
        const found = toSearchHits(events);
        setHits((current) =>
          cursor.page === 1 ? found : [...current, ...found],
        );
        // No bounds overlay on this path either, so a full page is the signal
        // that more may exist. Erring toward offering one more page costs an
        // empty request; erring the other way would hide results.
        setHasMore(found.length >= SEARCH_PAGE_SIZE);
        setError(null);
      })
      .catch((thrown: unknown) => {
        if (cancelled) return;
        setError(thrown instanceof Error ? thrown.message : "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cursor]);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;
    setCursor((current) => ({ ...current, page: current.page + 1 }));
  }, [isLoading, hasMore]);

  return { hits, isLoading, error, hasMore, loadMore };
}
