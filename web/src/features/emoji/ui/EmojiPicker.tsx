import { useMemo, useState } from "react";

import {
  searchEmoji,
  type CustomEmoji,
  type EmojiCatalog,
} from "@/features/emoji/emoji-model";
import { cn } from "@/shared/lib/cn";

/**
 * Emoji offered before the reader types anything.
 *
 * A small Unicode set rather than a full 3,000-entry table: the table would be
 * a bundle of its own, and what a chat actually reaches for is a handful of
 * acknowledgements plus whatever the workspace has defined for itself.
 */
export const COMMON_EMOJI = [
  "👍",
  "🎉",
  "✅",
  "👀",
  "❤️",
  "🙏",
  "🔥",
  "😄",
  "😅",
  "🤔",
  "💯",
  "🚀",
  "⚠️",
  "🐛",
  "☕",
  "💜",
];

/**
 * A grid of emoji — Unicode first, then whatever the workspace has published.
 *
 * Custom emoji come back as `:shortcode:` and the caller is responsible for the
 * matching `emoji` tag: NIP-30 requires the definition to travel with the event,
 * because a client that has never seen the author's set still has to render it.
 */
export function EmojiPicker({
  catalog,
  className,
  onPick,
}: {
  catalog: EmojiCatalog;
  className?: string;
  /** The Unicode character, or `:shortcode:` with its definition. */
  onPick: (choice: { text: string; emoji?: CustomEmoji }) => void;
}) {
  const [query, setQuery] = useState("");
  const custom = useMemo(() => searchEmoji(catalog, query), [catalog, query]);
  const unicode = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Unicode emoji have no names here to search, so a query simply narrows to
    // the custom half rather than pretending to match them.
    return needle ? [] : COMMON_EMOJI;
  }, [query]);

  return (
    <div
      className={cn(
        "w-64 rounded-lg border border-border bg-popover p-2 shadow-lg",
        className,
      )}
      data-testid="emoji-picker"
    >
      <input
        aria-label="Search emoji"
        autoComplete="off"
        className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1 text-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        data-testid="emoji-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search"
        value={query}
      />

      {unicode.length > 0 && (
        <div className="mb-2 grid grid-cols-8 gap-0.5">
          {unicode.map((emoji) => (
            <button
              aria-label={emoji}
              className="flex size-7 items-center justify-center rounded-md hover:bg-accent"
              key={emoji}
              onClick={() => onPick({ text: emoji })}
              type="button"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {custom.length > 0 && (
        <div className="grid grid-cols-8 gap-0.5">
          {custom.map((emoji) => (
            <button
              aria-label={`:${emoji.shortcode}:`}
              className="flex size-7 items-center justify-center rounded-md hover:bg-accent"
              data-testid={`emoji-${emoji.shortcode}`}
              key={`${emoji.author}:${emoji.shortcode}`}
              onClick={() => onPick({ text: `:${emoji.shortcode}:`, emoji })}
              type="button"
            >
              <img
                alt={`:${emoji.shortcode}:`}
                className="size-5 object-contain"
                draggable={false}
                src={emoji.url}
              />
            </button>
          ))}
        </div>
      )}

      {custom.length === 0 && unicode.length === 0 && (
        <p className="text-2xs text-muted-foreground">
          No emoji matches that. Custom emoji come from what members publish —
          add your own in Settings.
        </p>
      )}
    </div>
  );
}
