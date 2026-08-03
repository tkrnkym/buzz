/**
 * Channel command events, matching the `nuxx-sdk` builders.
 *
 * These are NIP-29 *commands*, not stored content: the relay validates each one,
 * executes it, and publishes the result as new group metadata (kind 39000) or a
 * system message (kind 40099). So there is nothing to reconcile optimistically —
 * a created channel appears because the relay said so, not because this client
 * assumed it would.
 */

import {
  KIND_DM_OPEN,
  KIND_NIP29_CREATE_GROUP,
  KIND_NIP29_JOIN_REQUEST,
  KIND_NIP29_LEAVE_REQUEST,
} from "@/shared/constants/kinds";

/**
 * `open` is searchable and joinable by anyone; `private` needs an invite.
 *
 * Spelled the way `nuxx_core::channel::ChannelVisibility` spells it — "public"
 * would be rejected by the relay's parser, and silently so from this client's
 * point of view.
 */
export type ChannelVisibility = "open" | "private";

/** `dm` and `workflow` also exist relay-side; neither is created from here. */
export type ChannelKind = "stream" | "forum";

/**
 * Canonical channel name, mirroring
 * `nuxx_core::channel::canonical_channel_name` exactly.
 *
 * Only a leading `#` or whitespace and trailing whitespace are stripped: the
 * relay does not lowercase, hyphenate, or drop punctuation, so neither does
 * this. Having it client-side is what lets the create dialog show the name that
 * will actually exist — a preview that "cleaned up" more than the relay does
 * would be a different kind of wrong than showing no preview at all.
 */
export function canonicalChannelName(name: string): string {
  return name.replace(/^[#\s]+/, "").trimEnd();
}

/** A v4 UUID, which is what a channel id is. */
export function newChannelId(): string {
  return crypto.randomUUID();
}

/**
 * Event template for creating a channel, matching
 * `nuxx-sdk::build_create_channel`.
 *
 * The client picks the id. That is deliberate in the protocol: the `h` tag has
 * to exist before the relay can scope anything to it, so the creator names the
 * room and the relay accepts or refuses it.
 */
export function buildCreateChannelTemplate(input: {
  channelId: string;
  name: string;
  visibility?: ChannelVisibility;
  channelType?: ChannelKind;
  about?: string | null;
  /** Seconds of inactivity after which the relay archives the channel. */
  ttlSeconds?: number | null;
}): { kind: number; tags: string[][]; content: string } {
  const name = canonicalChannelName(input.name);
  if (!name) throw new Error("A channel needs a name");

  const tags: string[][] = [
    ["h", input.channelId],
    ["name", name],
  ];
  if (input.visibility) tags.push(["visibility", input.visibility]);
  if (input.channelType) tags.push(["channel_type", input.channelType]);
  const about = input.about?.trim();
  if (about) tags.push(["about", about]);
  if (input.ttlSeconds) tags.push(["ttl", String(input.ttlSeconds)]);

  return { kind: KIND_NIP29_CREATE_GROUP, tags, content: "" };
}

/** Event template for joining a channel, matching `nuxx-sdk::build_join`. */
export function buildJoinChannelTemplate(channelId: string): {
  kind: number;
  tags: string[][];
  content: string;
} {
  return {
    kind: KIND_NIP29_JOIN_REQUEST,
    tags: [["h", channelId]],
    content: "",
  };
}

/** Event template for leaving a channel (NIP-29 kind 9022). */
export function buildLeaveChannelTemplate(channelId: string): {
  kind: number;
  tags: string[][];
  content: string;
} {
  return {
    kind: KIND_NIP29_LEAVE_REQUEST,
    tags: [["h", channelId]],
    content: "",
  };
}

/** How many people one DM may include, per `nuxx-sdk::build_dm_open`. */
export const MAX_DM_PARTICIPANTS = 8;

/**
 * Event template for opening a DM, matching `nuxx-sdk::build_dm_open`.
 *
 * No `h` tag: the relay allocates the channel and answers with its metadata.
 * Re-opening an existing conversation is the same event — the relay is what
 * decides whether a new room is needed, so this client never has to guess at a
 * deterministic id for a set of people.
 */
export function buildDmOpenTemplate(pubkeys: string[]): {
  kind: number;
  tags: string[][];
  content: string;
} {
  const unique = [
    ...new Set(pubkeys.map((key) => key.trim().toLowerCase()).filter(Boolean)),
  ];
  if (unique.length === 0) {
    throw new Error("A direct message needs at least one recipient");
  }
  if (unique.length > MAX_DM_PARTICIPANTS) {
    throw new Error(
      `A direct message takes at most ${MAX_DM_PARTICIPANTS} people`,
    );
  }
  for (const pubkey of unique) {
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      throw new Error(`Not a public key: ${pubkey}`);
    }
  }
  return {
    kind: KIND_DM_OPEN,
    tags: unique.map((pubkey) => ["p", pubkey]),
    content: "",
  };
}
