import { useEffect, useMemo, useState } from "react";

import { useMyPubkey } from "@/features/chat/use-chat";
import {
  buildDirectory,
  buildMemberListFilter,
  membersFromEvents,
  type DirectoryEntry,
} from "@/features/directory/directory-model";
import { useProfiles } from "@/features/profile/profile-store";
import { useShell } from "@/features/shell/shell-context";
import { postRelayQuery } from "@/shared/api/relay-http";

/**
 * Everyone the reader can address.
 *
 * Built from the member lists of the channels they are in — see
 * `directory-model` for why that bound is real rather than a shortcut. Fetched
 * once per channel set: membership changes rarely compared to how often a
 * composer opens an autocomplete, and a directory that re-queried on every
 * keystroke would be a request per character.
 */
export function useDirectory(): DirectoryEntry[] {
  const { channels, dms } = useShell();
  const myPubkey = useMyPubkey();
  const [roles, setRoles] = useState<Map<string, string>>(() => new Map());

  // Joined into a string so the effect fires on a change of membership, not on
  // every new array with the same channel ids.
  const channelKey = [...channels, ...dms]
    .map((channel) => channel.id)
    .join(",");

  useEffect(() => {
    const filter = buildMemberListFilter(
      channelKey ? channelKey.split(",") : [],
    );
    if (!filter) {
      setRoles(new Map());
      return;
    }
    let active = true;

    postRelayQuery([filter])
      .then((events) => {
        if (active) setRoles(membersFromEvents(events));
      })
      .catch(() => {
        // No directory is a degraded autocomplete, not a broken composer: a
        // reader can still type a name, and a DM still takes a pasted key.
      });

    return () => {
      active = false;
    };
  }, [channelKey]);

  const pubkeys = useMemo(() => [...roles.keys()], [roles]);
  const profiles = useProfiles(pubkeys);

  return useMemo(
    () => buildDirectory({ excludePubkey: myPubkey, profiles, roles }),
    [myPubkey, profiles, roles],
  );
}
