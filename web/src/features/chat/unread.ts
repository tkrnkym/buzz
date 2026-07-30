/**
 * Unread badges, asked for rather than listened to.
 *
 * The architecture this implements: **content subscriptions and unread
 * aggregation are separate concerns and must not share a transport.**
 *
 * - A *content* subscription is scoped to the one channel on screen. It carries
 *   message bodies, because the reader is looking at them.
 * - *Unread aggregation* is one bounded question per channel — "is there
 *   anything past my cursor?" — whose answer is a boolean. It must never be
 *   served by streaming bodies.
 *
 * The previous implementation collapsed the two: a channel-less subscription
 * received every message in the community and kept one timestamp per channel
 * from them. Correct, and proportional to community traffic rather than to the
 * question being asked — on a busy community a client would receive thousands of
 * message bodies a day to compute a handful of booleans.
 *
 * Here each channel contributes one filter with `limit: 1`, and `POST /query`
 * runs them independently, so one request returns at most one event per channel
 * and each says which channel it came from. Cost tracks the number of channels,
 * not the number of messages.
 *
 * The trade-off, stated plainly: this is a pull. A message in another channel
 * badges at the next poll rather than instantly. A relay-side per-channel
 * activity summary would restore immediacy without the firehose — that is the
 * long-term fix, and it belongs on the relay because the desktop client streams
 * the same way and would be fixed by the same change.
 */

import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";

import { CHANNEL_TIMELINE_CONTENT_KINDS } from "@/shared/constants/kinds";
import { UNREAD_HORIZON_SECONDS } from "@/features/chat/chat-model";

/**
 * Filters per request.
 *
 * One filter per channel is cheap, but a community with hundreds of channels
 * should not put them all in one body; the request is split instead.
 */
export const UNREAD_PROBE_MAX_FILTERS = 100;

/**
 * Build the per-channel probes.
 *
 * `since` is the read cursor plus one, because Nostr's `since` is inclusive and
 * the cursor itself has already been read. A channel with no cursor is probed
 * over the horizon window instead of all history: an unread badge for a room
 * whose last message is months old is noise, not information.
 */
export function buildUnreadProbeFilters(
  channelIds: string[],
  contexts: Record<string, number>,
  nowSeconds: number,
): NostrFilter[][] {
  const horizonStart = nowSeconds - UNREAD_HORIZON_SECONDS;

  const filters = channelIds.map((channelId) => {
    const cursor = contexts[channelId];
    return {
      kinds: CHANNEL_TIMELINE_CONTENT_KINDS,
      "#h": [channelId],
      since: cursor === undefined ? horizonStart : cursor + 1,
      // One event is the whole answer: the question is "any?", not "how many?".
      limit: 1,
    } satisfies NostrFilter;
  });

  const chunks: NostrFilter[][] = [];
  for (
    let index = 0;
    index < filters.length;
    index += UNREAD_PROBE_MAX_FILTERS
  ) {
    chunks.push(filters.slice(index, index + UNREAD_PROBE_MAX_FILTERS));
  }
  return chunks;
}

/**
 * Channels the probe found activity in.
 *
 * Each returned event names its own channel in the `h` tag, so one response
 * answers every filter it carried without the caller tracking which filter
 * produced what.
 */
export function channelsWithActivity(events: NostrEvent[]): Set<string> {
  const unread = new Set<string>();
  for (const event of events) {
    const channelId = event.tags.find((tag) => tag[0] === "h")?.[1];
    if (channelId) unread.add(channelId);
  }
  return unread;
}
