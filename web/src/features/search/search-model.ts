/**
 * Message search over NIP-50.
 *
 * A `search` field on a `POST /query` filter is routed to `nuxx-search`
 * (Postgres full-text) instead of the event table, and the relay returns whole
 * signed events in relevance order — not excerpts. Ranking therefore comes from
 * the server and must be preserved: re-sorting the response by timestamp, the
 * obvious thing to do with a list of events, throws away the only thing that
 * made these the answer.
 *
 * # Two constraints that are easy to get wrong
 *
 * **Kinds are mandatory.** An open-ended search hits the relay's p-gate and
 * returns 403 rather than searching everything ({@link SEARCHABLE_KINDS}).
 *
 * **Only some kinds are indexed at all.** The generated tsvector covers
 * `0, 9, 40002, 45001, 45003` (`migrations/0008_...`). Asking for a kind outside
 * that set is not an error — it simply never matches, which reads as "search is
 * broken" rather than "that kind is not indexed". So the request is built from
 * the indexed set rather than from whatever the timeline happens to render;
 * system rows (40099), for instance, are deliberately absent.
 *
 * # A limitation worth knowing before trusting results
 *
 * The index uses Postgres' `simple` dictionary, whose tokenizer splits on
 * whitespace and punctuation. That makes it unusable for languages written
 * without spaces: a Japanese sentence becomes a *single* lexeme, so
 * `会議の資料を共有します` is one token and searching `資料` finds nothing.
 * Latin words embedded in such a run are equally unreachable
 * (`Nuxxのdeployが完了` indexes as one token; `deploy` does not match).
 *
 * Verified against Postgres 16, not inferred. Fixing it is a relay-side change —
 * a CJK-aware tokenizer (`pg_bigm`, PGroonga) or an n-gram index — so this
 * module cannot work around it, and the UI should not imply coverage it lacks.
 */

import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";

import {
  KIND_FORUM_COMMENT,
  KIND_FORUM_POST,
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";

/**
 * Kinds worth searching, and all of them actually indexed.
 *
 * Profiles (kind 0) are indexed too but deliberately excluded: a people search
 * is a different question with a different result shape, and mixing profiles
 * into message hits makes both harder to scan.
 */
export const SEARCHABLE_KINDS = [
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_FORUM_POST,
  KIND_FORUM_COMMENT,
];

/** Hits per page. */
export const SEARCH_PAGE_SIZE = 30;

export interface SearchHit {
  id: string;
  pubkey: string;
  createdAt: number;
  content: string;
  /** Channel the hit belongs to, or null for a channel-less event. */
  channelId: string | null;
}

/**
 * Build the search request.
 *
 * `page` is 1-based, matching the relay's `extract_search_page`, which treats
 * anything below 1 as page 1.
 */
export function buildSearchFilter(
  query: string,
  page: number,
  channelId?: string | null,
): NostrFilter & { search: string; page: number } {
  return {
    kinds: SEARCHABLE_KINDS,
    search: query,
    limit: SEARCH_PAGE_SIZE,
    page,
    // Scoping to one channel is a server-side narrowing, not a client-side
    // filter of a community-wide result: without it the page would be filled by
    // hits from elsewhere and then mostly discarded.
    ...(channelId ? { "#h": [channelId] } : {}),
  };
}

/** Read a hit out of a returned event. */
export function toSearchHit(event: NostrEvent): SearchHit {
  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    content: event.content,
    channelId: event.tags.find((tag) => tag[0] === "h")?.[1] ?? null,
  };
}

/**
 * Turn the response into hits, preserving the order it arrived in.
 *
 * The relay hydrates FTS hits back into events through a lookup map explicitly
 * to keep relevance ordering, so the client's only job is not to disturb it.
 */
export function toSearchHits(events: NostrEvent[]): SearchHit[] {
  return events.map(toSearchHit);
}

/**
 * A short excerpt around the first match, for a result row.
 *
 * The relay returns whole events, so a long message would otherwise fill the
 * result list with text that has nothing to do with the query.
 *
 * Matching is case-insensitive and falls back to the head of the message when
 * the term does not appear literally. That fallback is reached more often than
 * it looks, because the typed query is not a substring pattern:
 * `websearch_to_tsquery` treats `"quoted phrases"` and `-negation` as operators,
 * prefix mode matches on lexeme prefixes, and only the query's *first* word is
 * used as the anchor here.
 *
 * It is **not** reached because of stemming. The relay indexes and queries with
 * Postgres' `simple` dictionary (`migrations/0008_...`, `nuxx-search/query.rs`),
 * which lowercases and splits but does not stem — "deploy" does not match
 * "deployed". Do not add stemming-shaped behaviour to this function on the
 * assumption that the index has it.
 */
export function excerpt(content: string, query: string, radius = 90): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  const term = query.trim().split(/\s+/)[0] ?? "";
  const at = term ? collapsed.toLowerCase().indexOf(term.toLowerCase()) : -1;

  if (at === -1) {
    return collapsed.length > radius * 2
      ? `${collapsed.slice(0, radius * 2)}…`
      : collapsed;
  }

  const start = Math.max(0, at - radius);
  const end = Math.min(collapsed.length, at + term.length + radius);
  return `${start > 0 ? "…" : ""}${collapsed.slice(start, end)}${
    end < collapsed.length ? "…" : ""
  }`;
}
