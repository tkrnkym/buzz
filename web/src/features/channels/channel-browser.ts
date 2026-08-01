/**
 * Finding a room you are not in yet.
 *
 * The relay serves kind:39000 metadata for every open channel in the community,
 * joined or not — which is what makes discovery possible at all, and also why
 * the sidebar cannot simply list everything it receives. Membership is the
 * separate fact, and it lives in the kind:39002 member lists.
 *
 * A private channel is deliberately not listed here. Its metadata carries the
 * `private` marker, and offering a Join button the relay is going to refuse is
 * worse than not offering one — an invite is how those are entered.
 */

import type { Channel } from "@/features/chat/chat-model";
import { KIND_NIP29_GROUP_MEMBERS } from "@/shared/constants/kinds";
import type { NostrEvent } from "@/shared/lib/nostr-client";
import { normalizePubkey } from "@/features/profile/profile-model";

/**
 * Channel ids whose member list names this pubkey.
 *
 * Per channel, unlike the directory's flattened `membersFromEvents`: the
 * question here is "which rooms am I in", and a map keyed by person cannot
 * answer it.
 */
export function joinedChannelIds(
  events: NostrEvent[],
  pubkey: string | null,
): Set<string> {
  const self = pubkey ? normalizePubkey(pubkey) : null;
  const joined = new Set<string>();
  if (!self) return joined;

  for (const event of events) {
    if (event.kind !== KIND_NIP29_GROUP_MEMBERS) continue;
    const channelId = event.tags.find((tag) => tag[0] === "d")?.[1];
    if (!channelId) continue;
    const member = event.tags.some(
      (tag) => tag[0] === "p" && normalizePubkey(tag[1] ?? "") === self,
    );
    if (member) joined.add(channelId);
  }
  return joined;
}

/**
 * Split the community's channels into the ones already joined and the rest.
 *
 * DMs and forums are excluded from "available": a DM is opened by naming
 * people, not by joining, and both would read as rooms that are missing from
 * the sidebar for no reason.
 */
export function partitionChannels({
  channels,
  joinedIds,
}: {
  channels: Channel[];
  joinedIds: ReadonlySet<string>;
}): { joined: Channel[]; available: Channel[] } {
  const joined: Channel[] = [];
  const available: Channel[] = [];

  for (const channel of channels) {
    if (channel.type === "dm" || channel.archived) continue;
    if (joinedIds.has(channel.id)) {
      joined.push(channel);
      continue;
    }
    if (channel.isPrivate) continue;
    available.push(channel);
  }

  return { joined, available };
}

/**
 * Channels matching a query, name-prefix first.
 *
 * The topic and description are searched too — someone looking for "release"
 * more often remembers what a room is *for* than what it is called.
 */
export function searchChannels(channels: Channel[], query: string): Channel[] {
  const needle = query.trim().toLowerCase().replace(/^#/, "");
  if (!needle) return channels;

  const scored: { channel: Channel; score: number }[] = [];
  for (const channel of channels) {
    const name = channel.name.toLowerCase();
    const context = `${channel.about ?? ""} ${channel.topic ?? ""}`
      .trim()
      .toLowerCase();

    let score = Number.POSITIVE_INFINITY;
    if (name.startsWith(needle)) score = 0;
    else if (name.includes(needle)) score = 1;
    else if (context.includes(needle)) score = 2;

    if (score !== Number.POSITIVE_INFINITY) scored.push({ channel, score });
  }

  return scored
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.channel.name.localeCompare(right.channel.name),
    )
    .map((hit) => hit.channel);
}
