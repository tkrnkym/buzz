import { useMemo } from "react";

import type { TypingEntry } from "@/features/chat/presence";
import { useUserLabels } from "@/features/profile/use-user-label";

/** How many typists are named before the rest are summarised. */
const MAX_NAMED = 2;

export function TypingIndicator({ typists }: { typists: TypingEntry[] }) {
  const pubkeys = useMemo(
    () => typists.map((entry) => entry.pubkey),
    [typists],
  );
  const { nameOf } = useUserLabels(pubkeys);

  // `nameOf`, not `labelOf`: the reader never sees their own typing, so a "You"
  // here could only ever be wrong.
  const names = typists.map((entry) => nameOf(entry.pubkey));
  const text =
    names.length === 0
      ? ""
      : names.length === 1
        ? `${names[0]} is typing…`
        : names.length <= MAX_NAMED
          ? `${names.join(" and ")} are typing…`
          : `${names.slice(0, MAX_NAMED).join(", ")} and ${names.length - MAX_NAMED} more are typing…`;

  return (
    // Reserved height whether or not anyone is typing: letting the row appear and
    // disappear would nudge the composer under the user's cursor mid-sentence.
    <p
      aria-live="polite"
      className="h-4 truncate px-4 text-2xs text-muted-foreground"
    >
      {text}
    </p>
  );
}
