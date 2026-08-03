/**
 * NIP-38 user status: the free-text line beside a name ("in a meeting ☕").
 *
 * Distinct from presence. Presence (kind 20001) is ephemeral and says whether
 * the relay currently sees you connected; a user status is durable, chosen, and
 * says what you are doing. Conflating them is why some clients show "away" as if
 * a person had set it.
 */

import { KIND_USER_STATUS } from "@/shared/constants/kinds";
import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";

/** The NIP-38 coordinate this app writes and reads. */
export const USER_STATUS_D_TAG = "general";

export interface UserStatus {
  text: string;
  emoji: string | null;
  updatedAt: number;
}

export function buildUserStatusFilter(pubkeys: string[]): NostrFilter | null {
  const authors = [
    ...new Set(pubkeys.map((key) => key.trim().toLowerCase())),
  ].filter(Boolean);
  if (authors.length === 0) return null;
  // Both `kinds` and `#d` are required: kind 30315 is parameterized-replaceable,
  // so a filter without the coordinate would also match other apps' statuses on
  // the same kind.
  return {
    kinds: [KIND_USER_STATUS],
    authors,
    "#d": [USER_STATUS_D_TAG],
  };
}

function firstTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

/**
 * Parse a kind:30315 event.
 *
 * Returns `null` when it carries neither text nor emoji — that is how a status is
 * cleared, and treating it as an empty status would leave a blank line under
 * every name that ever had one.
 */
export function eventToUserStatus(event: NostrEvent): UserStatus | null {
  if (event.kind !== KIND_USER_STATUS) return null;
  if (firstTag(event, "d") !== USER_STATUS_D_TAG) return null;
  const text = event.content.trim();
  const emoji = firstTag(event, "emoji")?.trim() ?? null;
  if (!text && !emoji) return null;
  return { text, emoji: emoji || null, updatedAt: event.created_at };
}

/** Newest status per author. */
export function toUserStatusLookup(
  events: NostrEvent[],
): Record<string, UserStatus> {
  const lookup: Record<string, UserStatus> = {};
  for (const event of events) {
    const status = eventToUserStatus(event);
    if (!status) continue;
    const pubkey = event.pubkey.toLowerCase();
    const current = lookup[pubkey];
    if (current && current.updatedAt >= status.updatedAt) continue;
    lookup[pubkey] = status;
  }
  return lookup;
}

/**
 * Event template for setting or clearing the reader's status, matching
 * `nuxx-sdk::build_user_status`.
 *
 * An event with empty content and no emoji tag is the clear: the kind is
 * replaceable on its coordinate, so publishing nothing *is* how you remove it.
 * There is no delete to issue.
 */
export function buildUserStatusTemplate(
  text: string,
  emoji?: string | null,
): { kind: number; tags: string[][]; content: string } {
  const tags: string[][] = [["d", USER_STATUS_D_TAG]];
  const trimmedEmoji = emoji?.trim();
  if (trimmedEmoji) tags.push(["emoji", trimmedEmoji]);
  return { kind: KIND_USER_STATUS, tags, content: text.trim() };
}
