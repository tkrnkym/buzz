import { useMemo } from "react";

import { useMyPubkey } from "@/features/chat/use-chat";
import { normalizePubkey } from "@/features/profile/profile-model";
import { useProfileStore } from "@/features/profile/profile-store";

/**
 * The names a rendered message may chip as a mention.
 *
 * Drawn from the profile cache rather than from the channel's membership,
 * because a message keeps its text after its author leaves: scoping the chip to
 * *current* members would un-style yesterday's mentions the moment someone was
 * removed, which reads as the message having been edited.
 *
 * Both the display name and the kind:0 `name` are offered, since an author may
 * type either — `@田中 健` and `@ken` are the same person and both should chip.
 *
 * `isSelfMention` is by label, not pubkey: at render time all the tree has is
 * the text. That means a stranger who takes the reader's display name gets a
 * highlighted chip — the same ambiguity every display-name system has, and the
 * reason the `p` tag rather than the text drives notifications.
 */
export function useMentionLabels(): {
  labels: string[];
  isSelfMention: (label: string) => boolean;
} {
  const { profiles } = useProfileStore();
  const myPubkey = useMyPubkey();

  return useMemo(() => {
    const labels = new Set<string>();
    const mine = new Set<string>();
    const self = myPubkey ? normalizePubkey(myPubkey) : null;

    for (const profile of Object.values(profiles)) {
      for (const name of [profile.displayName, profile.name]) {
        if (!name) continue;
        labels.add(name);
        if (profile.pubkey === self) mine.add(name);
      }
    }

    return {
      labels: [...labels],
      isSelfMention: (label: string) => mine.has(label),
    };
  }, [profiles, myPubkey]);
}
