/**
 * Starred channels, stored locally.
 *
 * Deliberately **not** a relay event: a star is a private view preference, and
 * publishing one would tell the whole community which rooms a reader cares
 * about. The desktop client kept these in `localStorage` for the same reason.
 * The consequence — stars do not follow the reader to another browser — is the
 * accepted trade, and is why nothing else in the app depends on them.
 *
 * The store is keyed by pubkey so two identities on one browser do not share
 * stars, and versioned so a future shape change can be detected rather than
 * misparsed.
 */

const STORAGE_KEY_PREFIX = "nuxx-channel-stars.v1";

export interface ChannelStarStore {
  version: 1;
  channelIds: string[];
}

export const EMPTY_STORE: ChannelStarStore = Object.freeze({
  version: 1,
  channelIds: Object.freeze([]) as unknown as string[],
});

export function storageKey(pubkey: string): string {
  return `${STORAGE_KEY_PREFIX}:${pubkey}`;
}

/**
 * Parse a stored payload, returning `null` for anything unrecognised.
 *
 * Unknown entries are dropped rather than the whole store being discarded: a
 * partially-corrupt list should cost the reader one star, not all of them.
 */
export function parseChannelStars(json: unknown): ChannelStarStore | null {
  if (typeof json !== "object" || json === null) return null;
  const payload = json as Record<string, unknown>;
  if (payload.version !== 1) return null;
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

export function readChannelStars(pubkey: string): ChannelStarStore {
  try {
    const raw = window.localStorage.getItem(storageKey(pubkey));
    if (!raw) return EMPTY_STORE;
    return parseChannelStars(JSON.parse(raw)) ?? EMPTY_STORE;
  } catch {
    // A blocked or full localStorage must not take the sidebar down with it.
    return EMPTY_STORE;
  }
}

export function writeChannelStars(
  pubkey: string,
  store: ChannelStarStore,
): boolean {
  try {
    window.localStorage.setItem(storageKey(pubkey), JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function toggleChannelStar(
  store: ChannelStarStore,
  channelId: string,
): ChannelStarStore {
  const has = store.channelIds.includes(channelId);
  return {
    version: 1,
    channelIds: has
      ? store.channelIds.filter((id) => id !== channelId)
      : [...store.channelIds, channelId],
  };
}
