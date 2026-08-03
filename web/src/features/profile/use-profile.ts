import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useMyPubkey } from "@/features/chat/use-chat";
import {
  buildProfileTemplate,
  eventToProfile,
  normalizePubkey,
  type UserProfile,
} from "@/features/profile/profile-model";
import { useProfileStore, useProfiles } from "@/features/profile/profile-store";
import {
  buildUserStatusFilter,
  buildUserStatusTemplate,
  toUserStatusLookup,
  type UserStatus,
} from "@/features/profile/user-status";
import { postRelayQuery } from "@/shared/api/relay-http";
import { useRelaySession } from "@/shared/api/relay-provider";

/** The reader's own profile, or `null` until it resolves (or if they have none). */
export function useMyProfile(): UserProfile | null {
  const pubkey = useMyPubkey();
  const profiles = useProfiles(pubkey ? [pubkey] : []);
  return pubkey ? (profiles[normalizePubkey(pubkey)] ?? null) : null;
}

/**
 * Publish the reader's profile.
 *
 * The published object replaces the whole profile — kind:0 is replaceable — so
 * callers must submit every field they want kept, not a partial form. On success
 * the new profile is written straight into the store: the relay does echo it
 * back, but waiting for that round trip means the reader watches their own edit
 * take a moment to appear.
 */
export function usePublishProfile() {
  const session = useRelaySession();
  const { put } = useProfileStore();

  return useMutation({
    mutationFn: async (fields: {
      displayName?: string | null;
      name?: string | null;
      about?: string | null;
      avatarUrl?: string | null;
      nip05?: string | null;
    }) => {
      const event = await session.publish(buildProfileTemplate(fields));
      const profile = eventToProfile(event);
      if (profile) put(profile);
      return event;
    },
  });
}

/** Set or clear the reader's NIP-38 status. Empty text and no emoji clears it. */
export function usePublishUserStatus() {
  const session = useRelaySession();

  return useMutation({
    mutationFn: async (input: { text: string; emoji?: string | null }) =>
      session.publish(buildUserStatusTemplate(input.text, input.emoji)),
  });
}

/**
 * The reader's own NIP-38 status.
 *
 * Over HTTP rather than the socket, and re-read after a write: kind 30315 is
 * stored, but a subscription for one author's coordinate is a whole
 * subscription's worth of bookkeeping for a value that changes by hand.
 */
export function useMyUserStatus(): {
  status: UserStatus | null;
  refresh: () => void;
} {
  const pubkey = useMyPubkey();
  const [status, setStatus] = useState<UserStatus | null>(null);
  // Aliveness on a ref rather than a per-effect flag, so `refresh` — which runs
  // outside any effect — is covered by the same unmount guard.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (!pubkey) return;
    const filter = buildUserStatusFilter([pubkey]);
    if (!filter) return;
    postRelayQuery([filter])
      .then((events) => {
        if (!alive.current) return;
        setStatus(toUserStatusLookup(events)[normalizePubkey(pubkey)] ?? null);
      })
      .catch(() => {
        // A status that cannot be read is shown as none rather than as an error:
        // it is decoration beside a name, and the reader can still set a new one.
      });
  }, [pubkey]);

  useEffect(() => refresh(), [refresh]);

  return { status, refresh };
}
