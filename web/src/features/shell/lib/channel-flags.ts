/**
 * Per-channel view preferences, stored locally.
 *
 * Deliberately **not** relay events. A star says which rooms a reader cares
 * about and a mute says which they are avoiding; publishing either would tell
 * the whole community. The desktop client kept both in `localStorage` for the
 * same reason. The consequence — they do not follow the reader to another
 * browser — is the accepted trade, and is why nothing else in the app depends on
 * them.
 *
 * One module for both flags rather than two near-identical ones: they have the
 * same shape, the same failure modes, and the same reasons for existing, so a
 * copy would only give them room to drift apart.
 *
 * Keyed by pubkey so two identities on one browser do not share preferences, and
 * versioned so a future shape change can be detected rather than misparsed.
 */

/** Which preference a store holds. The value is part of the storage key. */
export type ChannelFlag = "stars" | "mutes";

const STORAGE_KEY_PREFIX = "nuxx-channel";
const VERSION = 1;

export interface ChannelFlagStore {
  version: 1;
  channelIds: string[];
}

export const EMPTY_STORE: ChannelFlagStore = Object.freeze({
  version: 1,
  channelIds: Object.freeze([]) as unknown as string[],
});

export function storageKey(flag: ChannelFlag, pubkey: string): string {
  return `${STORAGE_KEY_PREFIX}-${flag}.v${VERSION}:${pubkey}`;
}

/**
 * Parse a stored payload, returning `null` for anything unrecognised.
 *
 * Unknown entries are dropped rather than the whole store being discarded: a
 * partially-corrupt list should cost the reader one preference, not all of them.
 */
export function parseChannelFlags(json: unknown): ChannelFlagStore | null {
  if (typeof json !== "object" || json === null) return null;
  const payload = json as Record<string, unknown>;
  if (payload.version !== VERSION) return null;
  if (!Array.isArray(payload.channelIds)) return null;
  return {
    version: 1,
    channelIds: [
      ...new Set(
        payload.channelIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    ],
  };
}

export function readChannelFlags(
  flag: ChannelFlag,
  pubkey: string,
): ChannelFlagStore {
  try {
    const raw = window.localStorage.getItem(storageKey(flag, pubkey));
    if (!raw) return EMPTY_STORE;
    return parseChannelFlags(JSON.parse(raw)) ?? EMPTY_STORE;
  } catch {
    // A blocked or full localStorage must not take the sidebar down with it.
    return EMPTY_STORE;
  }
}

export function writeChannelFlags(
  flag: ChannelFlag,
  pubkey: string,
  store: ChannelFlagStore,
): boolean {
  try {
    window.localStorage.setItem(
      storageKey(flag, pubkey),
      JSON.stringify(store),
    );
    return true;
  } catch {
    return false;
  }
}

export function toggleChannelFlag(
  store: ChannelFlagStore,
  channelId: string,
): ChannelFlagStore {
  const has = store.channelIds.includes(channelId);
  return {
    version: 1,
    channelIds: has
      ? store.channelIds.filter((id) => id !== channelId)
      : [...store.channelIds, channelId],
  };
}
