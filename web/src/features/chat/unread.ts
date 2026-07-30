/**
 * Unread badges, from relay-published activity snapshots.
 *
 * The architecture this implements: **content subscriptions and unread
 * aggregation are separate concerns and must not share a transport.**
 *
 * - A *content* subscription is scoped to the one channel on screen. It carries
 *   message bodies, because the reader is looking at them.
 * - *Unread aggregation* asks only "which channels moved, and when?" — an answer
 *   whose size tracks the number of channels, never the number of messages.
 *
 * # How this arrived here
 *
 * The first implementation collapsed the two: a channel-less subscription
 * received every message in the community and kept one timestamp per channel
 * from them. Correct, and proportional to community traffic rather than to the
 * question — thousands of message bodies a day to compute a handful of booleans.
 *
 * Replacing it with a bounded probe (one `limit: 1` filter per channel over
 * `POST /query`) fixed the bandwidth but not the shape. It still cost the relay
 * one query per channel per reader per poll, and `FILTER_QUERY_CONCURRENCY = 4`
 * on the relay meant a 200-channel probe ran as 50 serial database rounds. At
 * 5000 readers polling every 30s that is ~33,000 queries a second to answer a
 * question the relay could answer once for everybody.
 *
 * # What it does now
 *
 * The relay publishes activity snapshots (kind 39007), each carrying the
 * last-activity timestamps for a whole *shard* of channels. A client subscribes
 * once and keeps up; there is no polling and no per-channel request. Cost on the
 * relay is one rebuild per shard per coalescing window for the whole community,
 * independent of how many people are connected.
 *
 * Unread is then computed here, locally, by comparing each channel's timestamp
 * against this reader's own cursor. The relay publishes when rooms moved; it
 * never learns who has read what.
 */

import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";

import { KIND_CHANNEL_ACTIVITY_SNAPSHOT } from "@/shared/constants/kinds";
import { UNREAD_HORIZON_SECONDS } from "@/features/chat/chat-model";

/** Channel id → unix seconds of the last activity in it. */
export type ActivityMap = Record<string, number>;

/**
 * The subscription behind every badge.
 *
 * One filter, no channel scoping and no author scoping: the relay decides which
 * shards a reader may see and addresses them accordingly, so asking for
 * "activity snapshots" returns exactly the ones meant for this client. Asking
 * more narrowly would not gain privacy — it would only risk missing a shard.
 */
export function buildActivityFilter(): NostrFilter {
  return { kinds: [KIND_CHANNEL_ACTIVITY_SNAPSHOT] };
}

/**
 * Read the channel timestamps out of a snapshot event.
 *
 * Returns an empty map for anything unparseable rather than throwing: one
 * malformed snapshot must not take out every badge in the sidebar.
 */
export function parseActivitySnapshot(event: NostrEvent): ActivityMap {
  let payload: unknown;
  try {
    payload = JSON.parse(event.content);
  } catch {
    return {};
  }
  if (typeof payload !== "object" || payload === null) return {};

  const channels = (payload as { channels?: unknown }).channels;
  if (typeof channels !== "object" || channels === null) return {};

  const out: ActivityMap = {};
  for (const [channelId, at] of Object.entries(channels)) {
    if (typeof at === "number" && Number.isFinite(at)) out[channelId] = at;
  }
  return out;
}

/**
 * Fold a snapshot into the accumulated activity map.
 *
 * Shards are merged rather than replaced, because each event carries only its
 * own shard — replacing would leave a client holding whichever shard arrived
 * most recently and nothing else. Within a channel the newer timestamp wins, so
 * a re-delivered older snapshot cannot walk a channel's activity backwards.
 *
 * Returns the same reference when nothing moved, so an unchanged shard does not
 * re-render the sidebar once per coalescing window.
 */
export function mergeActivity(
  current: ActivityMap,
  incoming: ActivityMap,
): ActivityMap {
  let changed = false;
  const merged = { ...current };
  for (const [channelId, at] of Object.entries(incoming)) {
    const known = merged[channelId];
    if (known === undefined || at > known) {
      merged[channelId] = at;
      changed = true;
    }
  }
  return changed ? merged : current;
}

/**
 * Whether a channel has activity this reader has not seen.
 *
 * A channel with no cursor is unread only if it moved inside the horizon: a
 * badge for a room whose newest message is months old is noise, not information.
 */
export function isChannelUnread(
  channelId: string,
  activity: ActivityMap,
  contexts: Record<string, number>,
  nowSeconds: number,
): boolean {
  const lastActivity = activity[channelId];
  if (lastActivity === undefined) return false;

  const cursor = contexts[channelId];
  if (cursor === undefined) {
    return lastActivity >= nowSeconds - UNREAD_HORIZON_SECONDS;
  }
  return lastActivity > cursor;
}
