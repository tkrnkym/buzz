import { useCallback } from "react";

import { useMyPubkey } from "@/features/chat/use-chat";
import { resolveUserLabel } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";

export interface UserLabelResolver {
  /** The person's name, or "You" for the reader. */
  labelOf: (pubkey: string) => string;
  /** The person's own name even when that person is the reader. */
  nameOf: (pubkey: string) => string;
}

/**
 * Name resolution for a set of pubkeys, requesting any profiles not cached yet.
 *
 * A resolver rather than a map, so callers cannot accidentally read a pubkey
 * they never asked for and get a truncated key that never resolves — asking is
 * what puts it in the fetch queue.
 */
export function useUserLabels(pubkeys: string[]): UserLabelResolver {
  const profiles = useProfiles(pubkeys);
  const myPubkey = useMyPubkey();

  const labelOf = useCallback(
    (pubkey: string) =>
      resolveUserLabel({ pubkey, profiles, currentPubkey: myPubkey }),
    [profiles, myPubkey],
  );

  const nameOf = useCallback(
    (pubkey: string) =>
      resolveUserLabel({ pubkey, profiles, preferResolvedSelfLabel: true }),
    [profiles],
  );

  return { labelOf, nameOf };
}
