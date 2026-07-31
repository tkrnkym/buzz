/**
 * The profile cache.
 *
 * An accumulating store rather than a query keyed on the visible pubkey set.
 * The desktop client learned this the hard way: keying a batch query on "who is
 * on screen" means a transient author — someone who typed once, a message that
 * scrolled in — re-keys the query and hands every consumer a new object
 * identity, which re-renders the whole timeline. Here a pubkey is fetched once
 * and kept, so scrolling costs nothing after the first pass.
 *
 * Requests are coalesced into one batch per frame-ish window, because a timeline
 * mounting fifty rows would otherwise ask fifty times for the same fifty keys.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { postRelayQuery } from "@/shared/api/relay-http";
import {
  buildProfileFilters,
  normalizePubkey,
  toProfileLookup,
  type ProfileLookup,
  type UserProfile,
} from "@/features/profile/profile-model";

/** How long to gather pubkeys before firing one batch. */
const COALESCE_MS = 50;

interface ProfileStoreValue {
  profiles: ProfileLookup;
  /** Ask for these pubkeys. Unknown ones are fetched; known ones cost nothing. */
  request: (pubkeys: string[]) => void;
  /** Merge a locally-published profile so the reader sees their own edit at once. */
  put: (profile: UserProfile) => void;
}

const ProfileStoreContext = createContext<ProfileStoreValue | null>(null);

export function ProfileStoreProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<ProfileLookup>({});
  /**
   * Every pubkey already asked about, answered or not.
   *
   * A key with no kind:0 event must stay in here: without it, "not found" would
   * look identical to "not yet requested" and the store would re-ask for every
   * profile-less author on every render.
   */
  const asked = useRef<Set<string>>(new Set());
  const queue = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const flush = useCallback(async () => {
    timer.current = null;
    const pending = [...queue.current];
    queue.current.clear();
    if (pending.length === 0) return;

    try {
      const events = await postRelayQuery(buildProfileFilters(pending));
      if (!alive.current) return;
      const fetched = toProfileLookup(events);
      if (Object.keys(fetched).length === 0) return;
      setProfiles((current) => ({ ...current, ...fetched }));
    } catch {
      // A failed batch leaves those keys marked as asked, so the timeline shows
      // truncated pubkeys rather than retrying on every scroll. The next reload
      // asks again.
    }
  }, []);

  const request = useCallback(
    (pubkeys: string[]) => {
      let queued = false;
      for (const raw of pubkeys) {
        const pubkey = normalizePubkey(raw);
        if (!pubkey || asked.current.has(pubkey)) continue;
        asked.current.add(pubkey);
        queue.current.add(pubkey);
        queued = true;
      }
      if (!queued || timer.current !== null) return;
      timer.current = setTimeout(() => void flush(), COALESCE_MS);
    },
    [flush],
  );

  const put = useCallback((profile: UserProfile) => {
    asked.current.add(profile.pubkey);
    setProfiles((current) => ({ ...current, [profile.pubkey]: profile }));
  }, []);

  const value = useMemo<ProfileStoreValue>(
    () => ({ profiles, request, put }),
    [profiles, request, put],
  );

  return (
    <ProfileStoreContext.Provider value={value}>
      {children}
    </ProfileStoreContext.Provider>
  );
}

export function useProfileStore(): ProfileStoreValue {
  const value = useContext(ProfileStoreContext);
  if (!value) {
    throw new Error(
      "useProfileStore must be used inside <ProfileStoreProvider>",
    );
  }
  return value;
}

/**
 * Profiles for a set of pubkeys, requesting any that are not cached yet.
 *
 * The returned lookup is the whole cache, not a filtered copy: consumers read it
 * by key, and slicing it per caller would hand each one a fresh object every
 * render — the identity churn this store exists to avoid.
 */
export function useProfiles(pubkeys: string[]): ProfileLookup {
  const { profiles, request } = useProfileStore();
  // Rebuilt from a joined key so the effect's dependency is the *membership*,
  // not a fresh array with the same contents — callers routinely pass a mapped
  // array that is new on every render.
  const key = pubkeys.join(",");
  const requested = useMemo(() => (key ? key.split(",") : []), [key]);

  useEffect(() => {
    if (requested.length > 0) request(requested);
  }, [requested, request]);

  return profiles;
}
