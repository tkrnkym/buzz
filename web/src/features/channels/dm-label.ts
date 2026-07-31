/**
 * What a direct message is called.
 *
 * The relay gives a DM a generic name (`dm`, `Group DM (3)`), so the label a
 * reader recognises has to be built from who is in it. Ported from the desktop
 * client's `dmParticipantDisplay` / `channelLabels`.
 */

import type { Channel } from "@/features/chat/chat-model";
import {
  resolveUserLabel,
  type ProfileLookup,
} from "@/features/profile/profile-model";

/**
 * Names the relay uses when it has nothing better, which this module replaces.
 *
 * A DM whose name is *not* one of these was named deliberately — by a person or
 * by a future relay feature — so it is kept as-is rather than overwritten with a
 * participant list.
 */
function isGenericDmName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "dm" ||
    normalized === "direct message" ||
    normalized === "direct messages" ||
    /^group dm\s*(\(\d+\))?$/.test(normalized)
  );
}

/** Join names the way prose does: "a", "a and b", "a, b and c". */
export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The people in a DM other than the reader.
 *
 * A note-to-self DM — the reader alone — falls back to including them, because
 * "" is not a label and the room does exist.
 */
export function dmCounterparts(
  channel: Channel,
  currentPubkey: string | null | undefined,
): string[] {
  const self = currentPubkey?.toLowerCase();
  const others = channel.participantPubkeys.filter((pubkey) => pubkey !== self);
  return others.length > 0 ? others : channel.participantPubkeys;
}

/**
 * Label for a channel row: the channel's own name, except for a generically
 * named DM, which is labelled by its participants.
 */
export function resolveChannelLabel(input: {
  channel: Channel;
  currentPubkey?: string | null;
  profiles?: ProfileLookup;
}): string {
  const { channel, currentPubkey, profiles } = input;
  if (channel.type !== "dm" || !isGenericDmName(channel.name)) {
    return channel.name;
  }

  const counterparts = dmCounterparts(channel, currentPubkey);
  if (counterparts.length === 0) return channel.name;

  const names = [
    ...new Set(
      counterparts.map((pubkey) =>
        // `preferResolvedSelfLabel`, so a note-to-self DM is titled with the
        // reader's own name rather than "You" — which reads as a bug in a list.
        resolveUserLabel({ pubkey, profiles, preferResolvedSelfLabel: true }),
      ),
    ),
  ];
  return joinNames(names) || channel.name;
}
