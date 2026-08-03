/**
 * NIP-01 profile metadata (kind:0), and the label rules built on it.
 *
 * Ported from the desktop client's `profile/lib/identity`. Everything in this
 * app that names a person goes through `resolveUserLabel`, so a display name, a
 * NIP-05 handle, and a bare pubkey all render by one rule rather than each
 * component inventing its own precedence.
 *
 * A profile is self-asserted: kind:0 is signed by its subject, so a display name
 * proves only that the key holder chose it. That is why `truncatePubkey` remains
 * the last resort rather than "Unknown", and why nothing here is ever used to
 * make an authorization decision.
 */

import { KIND_PROFILE } from "@/shared/constants/kinds";
import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";
import { truncatePubkey } from "@/shared/lib/pubkey";

export interface UserProfile {
  pubkey: string;
  /** kind:0 `display_name`, the name a person chose to be shown by. */
  displayName: string | null;
  /** kind:0 `name`, the short handle used for mentions. */
  name: string | null;
  about: string | null;
  avatarUrl: string | null;
  /** kind:0 `nip05`, an identifier the relay may or may not have verified. */
  nip05: string | null;
  /** When this metadata was signed, for newest-wins resolution. */
  updatedAt: number;
}

export type ProfileLookup = Record<string, UserProfile>;

/** Lowercase hex, so one key never appears under two spellings. */
export function normalizePubkey(pubkey: string): string {
  return pubkey.trim().toLowerCase();
}

/** How many authors one kind:0 filter asks about. */
export const PROFILE_BATCH_SIZE = 100;

/**
 * Filters for a set of authors, chunked.
 *
 * Chunked because a filter naming thousands of authors is one query the relay
 * has to plan as a single scan; the desktop client hit this on large
 * communities. `POST /query` runs the filters concurrently, so the chunks cost
 * one request either way.
 */
export function buildProfileFilters(pubkeys: string[]): NostrFilter[] {
  const unique = [...new Set(pubkeys.map(normalizePubkey))].filter(Boolean);
  const filters: NostrFilter[] = [];
  for (let index = 0; index < unique.length; index += PROFILE_BATCH_SIZE) {
    filters.push({
      kinds: [KIND_PROFILE],
      authors: unique.slice(index, index + PROFILE_BATCH_SIZE),
    });
  }
  return filters;
}

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Parse a kind:0 event.
 *
 * Returns `null` for content that is not a JSON object — a profile whose content
 * cannot be read should be absent, not a row of empty fields, so callers fall
 * back to the pubkey rather than rendering a nameless person.
 */
export function eventToProfile(event: NostrEvent): UserProfile | null {
  if (event.kind !== KIND_PROFILE) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const fields = parsed as Record<string, unknown>;

  return {
    pubkey: normalizePubkey(event.pubkey),
    displayName: trimmedOrNull(fields.display_name),
    name: trimmedOrNull(fields.name),
    about: trimmedOrNull(fields.about),
    avatarUrl: trimmedOrNull(fields.picture),
    nip05: trimmedOrNull(fields.nip05),
    updatedAt: event.created_at,
  };
}

/**
 * Newest profile per author.
 *
 * kind:0 is replaceable, so a relay may still hand back an older copy alongside
 * the current one — on reconnect, or from a different shard. Taking the newest
 * by `created_at` is what keeps a stale name from winning; the id breaks ties so
 * the result does not depend on delivery order.
 */
export function toProfileLookup(events: NostrEvent[]): ProfileLookup {
  const lookup: ProfileLookup = {};
  const newestId: Record<string, string> = {};
  for (const event of events) {
    const profile = eventToProfile(event);
    if (!profile) continue;
    const current = lookup[profile.pubkey];
    if (
      current &&
      (current.updatedAt > profile.updatedAt ||
        (current.updatedAt === profile.updatedAt &&
          newestId[profile.pubkey] > event.id))
    ) {
      continue;
    }
    lookup[profile.pubkey] = profile;
    newestId[profile.pubkey] = event.id;
  }
  return lookup;
}

/**
 * The one name-resolution rule.
 *
 * Precedence: the reader is "You" (unless the caller asked for their real
 * label), then `display_name`, then `name`, then the NIP-05 handle, then a
 * caller-supplied fallback, then the truncated pubkey.
 */
export function resolveUserLabel(input: {
  pubkey: string;
  currentPubkey?: string | null;
  fallbackName?: string | null;
  profiles?: ProfileLookup;
  /** True where "You" would be wrong — a profile card about yourself. */
  preferResolvedSelfLabel?: boolean;
}): string {
  const {
    currentPubkey,
    fallbackName,
    preferResolvedSelfLabel = false,
    profiles,
    pubkey,
  } = input;

  if (
    !preferResolvedSelfLabel &&
    currentPubkey &&
    normalizePubkey(currentPubkey) === normalizePubkey(pubkey)
  ) {
    return "You";
  }

  const profile = profiles?.[normalizePubkey(pubkey)];
  return (
    profile?.displayName ??
    profile?.name ??
    profile?.nip05 ??
    fallbackName?.trim() ??
    truncatePubkey(pubkey)
  );
}

/**
 * The secondary line under a name: the NIP-05 handle, but only when it is not
 * already doing duty as the primary label.
 */
export function resolveUserSecondaryLabel(input: {
  pubkey: string;
  profiles?: ProfileLookup;
}): string | null {
  const profile = input.profiles?.[normalizePubkey(input.pubkey)];
  if (!profile?.nip05) return null;
  return profile.displayName || profile.name ? profile.nip05 : null;
}

export function resolveAvatarUrl(
  pubkey: string,
  profiles?: ProfileLookup,
): string | null {
  return profiles?.[normalizePubkey(pubkey)]?.avatarUrl ?? null;
}

/**
 * Event template for publishing the reader's own profile, matching
 * `nuxx-sdk::build_profile`.
 *
 * Only non-empty fields are written. kind:0 is replaceable, so the published
 * object *is* the whole profile — omitting a field a previous event carried
 * clears it, which is why the editor loads the current values first rather than
 * submitting a partial form.
 */
export function buildProfileTemplate(fields: {
  displayName?: string | null;
  name?: string | null;
  about?: string | null;
  avatarUrl?: string | null;
  nip05?: string | null;
}): { kind: number; tags: string[][]; content: string } {
  const content: Record<string, string> = {};
  const put = (key: string, value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) content[key] = trimmed;
  };
  put("display_name", fields.displayName);
  put("name", fields.name);
  put("picture", fields.avatarUrl);
  put("about", fields.about);
  put("nip05", fields.nip05);

  return { kind: KIND_PROFILE, tags: [], content: JSON.stringify(content) };
}
