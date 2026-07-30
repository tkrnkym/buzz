import type { TypingEntry } from "@/features/chat/presence";
import { truncatePubkey } from "@/shared/lib/pubkey";

/** How many typists are named before the rest are summarised. */
const MAX_NAMED = 2;

function describe(typists: TypingEntry[]): string {
  const names = typists.map((entry) => truncatePubkey(entry.pubkey));
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length <= MAX_NAMED) return `${names.join(" and ")} are typing…`;
  const remaining = names.length - MAX_NAMED;
  return `${names.slice(0, MAX_NAMED).join(", ")} and ${remaining} more are typing…`;
}

export function TypingIndicator({ typists }: { typists: TypingEntry[] }) {
  return (
    // Reserved height whether or not anyone is typing: letting the row appear and
    // disappear would nudge the composer under the user's cursor mid-sentence.
    <p
      aria-live="polite"
      className="h-4 truncate px-4 text-2xs text-muted-foreground"
    >
      {typists.length > 0 ? describe(typists) : ""}
    </p>
  );
}
