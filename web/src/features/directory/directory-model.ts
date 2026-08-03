/**
 * The community directory: who this reader can address.
 *
 * The relay exposes no user-search endpoint, so a directory has to be built from
 * what a member can already see: the NIP-29 member lists (kind:39002) of the
 * channels they are in, resolved to names through the profile cache. That is a
 * real bound rather than a shortcut — a member cannot enumerate a community they
 * are not part of, and this client should not pretend otherwise.
 *
 * The consequence worth stating: someone who shares no channel with the reader
 * does not appear here, which is why the DM dialog still accepts a pasted public
 * key.
 */

import { KIND_NIP29_GROUP_MEMBERS } from "@/shared/constants/kinds";
import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";
import {
  normalizePubkey,
  resolveUserLabel,
  type ProfileLookup,
} from "@/features/profile/profile-model";

export interface DirectoryEntry {
  pubkey: string;
  /** Display name, or the truncated key when no profile is known. */
  label: string;
  /** kind:0 `name`, matched separately so `@ken` finds 田中 健. */
  handle: string | null;
  /** NIP-29 role on at least one shared channel: owner, admin, or member. */
  role: string | null;
}

/**
 * Member lists for the given channels.
 *
 * Addressable events keyed by `d` = the channel id, so this is one filter for
 * every channel rather than one per channel.
 */
export function buildMemberListFilter(
  channelIds: string[],
): NostrFilter | null {
  const ids = [...new Set(channelIds)].filter(Boolean);
  if (ids.length === 0) return null;
  return { kinds: [KIND_NIP29_GROUP_MEMBERS], "#d": ids };
}

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, member: 2 };

/**
 * Pubkeys and roles from a set of kind:39002 events.
 *
 * A person in several channels appears once, under their strongest role — a
 * directory that listed someone twice, or as a plain member because that is the
 * last list parsed, would be worse than one that is slightly generous about
 * seniority.
 */
export function membersFromEvents(events: NostrEvent[]): Map<string, string> {
  const roles = new Map<string, string>();
  for (const event of events) {
    if (event.kind !== KIND_NIP29_GROUP_MEMBERS) continue;
    for (const tag of event.tags) {
      // NIP-29 convention: ["p", pubkey, relay_url, role].
      if (tag[0] !== "p" || typeof tag[1] !== "string") continue;
      const pubkey = normalizePubkey(tag[1]);
      if (!pubkey) continue;
      const role = typeof tag[3] === "string" && tag[3] ? tag[3] : "member";
      const current = roles.get(pubkey);
      if (
        current === undefined ||
        (ROLE_RANK[role] ?? 99) < (ROLE_RANK[current] ?? 99)
      ) {
        roles.set(pubkey, role);
      }
    }
  }
  return roles;
}

/** Resolve the raw member map into named, sorted entries. */
export function buildDirectory({
  excludePubkey,
  profiles,
  roles,
}: {
  /** Usually the reader, who is not a candidate to mention or DM. */
  excludePubkey?: string | null;
  profiles: ProfileLookup;
  roles: Map<string, string>;
}): DirectoryEntry[] {
  const self = excludePubkey ? normalizePubkey(excludePubkey) : null;
  const entries: DirectoryEntry[] = [];

  for (const [pubkey, role] of roles) {
    if (pubkey === self) continue;
    entries.push({
      pubkey,
      // Never "You": these are people to address, and the reader is excluded.
      label: resolveUserLabel({
        pubkey,
        profiles,
        preferResolvedSelfLabel: true,
      }),
      handle: profiles[pubkey]?.name ?? null,
      role,
    });
  }

  return entries.sort((left, right) => left.label.localeCompare(right.label));
}

/**
 * Rank directory entries against a query.
 *
 * A prefix match beats a contained match, and a name beats a handle, so typing
 * `@ke` puts 健 above someone whose handle merely contains "ke". An empty query
 * returns everyone, which is what makes `@` alone open a browsable list.
 *
 * The pubkey is matched too, but only as a prefix: a reader pasting a key should
 * find its owner, while a substring match against 64 hex characters would pair
 * arbitrary people with arbitrary queries.
 */
export function searchDirectory(
  entries: DirectoryEntry[],
  query: string,
  limit = 8,
): DirectoryEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries.slice(0, limit);

  const scored: { entry: DirectoryEntry; score: number }[] = [];
  for (const entry of entries) {
    const label = entry.label.toLowerCase();
    const handle = entry.handle?.toLowerCase() ?? "";

    let score = Number.POSITIVE_INFINITY;
    if (label.startsWith(needle)) score = 0;
    else if (handle.startsWith(needle)) score = 1;
    else if (label.includes(needle)) score = 2;
    else if (handle.includes(needle)) score = 3;
    else if (entry.pubkey.startsWith(needle)) score = 4;

    if (score !== Number.POSITIVE_INFINITY) scored.push({ entry, score });
  }

  return scored
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.entry.label.localeCompare(right.entry.label),
    )
    .slice(0, limit)
    .map((hit) => hit.entry);
}
