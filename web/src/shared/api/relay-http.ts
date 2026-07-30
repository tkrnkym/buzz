/**
 * Authenticated reads over the relay's HTTP bridge.
 *
 * Two things genuinely need HTTP rather than the WebSocket session:
 *
 * - **Presence**, because ephemeral events are never stored and the relay only
 *   synthesizes current status for a `POST /query`.
 * - **Unread probes**, because the answer is one bounded question per channel
 *   rather than a stream to listen to.
 *
 * `POST /query` runs each filter independently and concurrently and honours each
 * filter's own `limit` (`query_events_authed` in `crates/buzz-relay/src/api/
 * bridge.rs`), so a single request can carry one question per channel and come
 * back with at most one event each.
 */

import { makeNip98AuthHeader } from "@/shared/lib/nip98";
import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";
import { relayHttpBaseUrl } from "@/shared/lib/relay-url";

/** Run filters through the relay's HTTP query bridge. */
export async function postRelayQuery(
  filters: NostrFilter[],
): Promise<NostrEvent[]> {
  if (filters.length === 0) return [];

  const url = `${relayHttpBaseUrl()}/query`;
  const body = JSON.stringify({ filters });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: await makeNip98AuthHeader(url, "POST", { body }),
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Relay query failed: ${response.status}`);
  }
  const events: unknown = await response.json();
  return Array.isArray(events) ? (events as NostrEvent[]) : [];
}
