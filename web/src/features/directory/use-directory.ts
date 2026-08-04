import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useChannels, useDms, useMyPubkey } from "@/features/chat/use-chat";
import {
  buildDirectory,
  buildMemberListFilter,
  membersFromEvents,
  type DirectoryEntry,
} from "@/features/directory/directory-model";
import { normalizePubkey } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { postRelayQuery } from "@/shared/api/relay-http";

const EMPTY_ROLES: Map<string, string> = new Map();

/**
 * NIP-29 roles for everyone in the reader's channels, keyed by pubkey.
 *
 * Cached rather than fetched per caller: membership changes rarely compared to
 * how often something asks about it, and the two consumers here — the mention
 * autocomplete and the moderator gate on a message — would otherwise issue the
 * same query twice on every channel switch.
 *
 * The channel list comes from `useChannels`/`useDms` rather than the shell. Roles are
 * asked about on the Settings window too, which is not inside `ShellProvider` — and
 * the shell exists for the read cursors and the presence heartbeat, neither of which
 * this needs. React Query dedupes the channel query, so reading it directly costs a
 * cache lookup rather than a second request.
 */
export function useMemberRoles(): Map<string, string> {
  const channels = useChannels().data ?? [];
  const dms = useDms().data ?? [];
  // Joined into a string so the query key changes on a change of membership, not
  // on every new array carrying the same channel ids.
  const channelKey = [...channels, ...dms]
    .map((channel) => channel.id)
    .join(",");

  const query = useQuery({
    queryKey: ["directory", "member-roles", channelKey],
    queryFn: async () => {
      const filter = buildMemberListFilter(
        channelKey ? channelKey.split(",") : [],
      );
      if (!filter) return EMPTY_ROLES;
      return membersFromEvents(await postRelayQuery([filter]));
    },
    // A failure is a degraded autocomplete, not a broken composer: a reader can
    // still type a name, and a DM still takes a pasted key.
    staleTime: 60_000,
  });

  return query.data ?? EMPTY_ROLES;
}

/**
 * The reader's own role in this community, or `null` while unknown.
 *
 * `null` rather than `"member"` when the lists have not loaded: the difference
 * matters at the only place this is read — a moderator-only control, which must
 * stay hidden until the client actually knows the reader is one.
 */
export function useMyRole(): string | null {
  const roles = useMemberRoles();
  const myPubkey = useMyPubkey();
  if (!myPubkey) return null;
  return roles.get(normalizePubkey(myPubkey)) ?? null;
}

/** True when the reader may issue moderation commands. */
export function useCanModerate(): boolean {
  const role = useMyRole();
  return role === "owner" || role === "admin";
}

/**
 * Everyone the reader can address.
 *
 * Built from the member lists of the channels they are in — see
 * `directory-model` for why that bound is real rather than a shortcut.
 */
export function useDirectory(): DirectoryEntry[] {
  const roles = useMemberRoles();
  const myPubkey = useMyPubkey();

  const pubkeys = useMemo(() => [...roles.keys()], [roles]);
  const profiles = useProfiles(pubkeys);

  return useMemo(
    () => buildDirectory({ excludePubkey: myPubkey, profiles, roles }),
    [myPubkey, profiles, roles],
  );
}
