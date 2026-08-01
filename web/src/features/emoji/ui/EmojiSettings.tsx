import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { isShortcode, type CustomEmoji } from "@/features/emoji/emoji-model";
import { useMyEmoji } from "@/features/emoji/use-emoji";
import { useMyPubkey } from "@/features/chat/use-chat";

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * The reader's own custom emoji.
 *
 * Editing publishes the whole kind:30030 set, because it is addressable: the
 * published event *is* the new state, so there is no add/remove protocol and
 * nothing to reconcile. What everyone else sees is the union of every member's
 * set — which is why this says "yours" rather than "the workspace's".
 */
export function EmojiSettings() {
  const myPubkey = useMyPubkey();
  const { emoji, save } = useMyEmoji();
  const [shortcode, setShortcode] = useState("");
  const [url, setUrl] = useState("");

  const normalized = shortcode.trim().toLowerCase().replace(/:/g, "");
  const duplicate = emoji.some((entry) => entry.shortcode === normalized);
  const valid = isShortcode(normalized) && url.trim().length > 0 && !duplicate;

  const publish = (next: CustomEmoji[]) => {
    save.mutate(next, {
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not save your emoji",
        ),
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="emoji-settings">
      {emoji.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {emoji.map((entry) => (
            <li
              className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1"
              key={entry.shortcode}
            >
              <img
                alt={`:${entry.shortcode}:`}
                className="size-5 object-contain"
                src={entry.url}
              />
              <span className="text-2xs text-secondary-foreground">
                :{entry.shortcode}:
              </span>
              <button
                aria-label={`Remove :${entry.shortcode}:`}
                className="text-muted-foreground hover:text-foreground"
                disabled={save.isPending}
                onClick={() =>
                  publish(
                    emoji.filter((kept) => kept.shortcode !== entry.shortcode),
                  )
                }
                type="button"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || !myPubkey) return;
          publish([
            ...emoji,
            {
              shortcode: normalized,
              url: url.trim(),
              author: myPubkey,
              pack: null,
            },
          ]);
          setShortcode("");
          setUrl("");
        }}
      >
        <label className="flex min-w-32 flex-1 flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            Shortcode
          </span>
          <input
            className={FIELD_CLASS}
            data-testid="emoji-shortcode"
            onChange={(event) => setShortcode(event.target.value)}
            placeholder="ship_it"
            value={shortcode}
          />
        </label>
        <label className="flex min-w-48 flex-[2] flex-col gap-1">
          <span className="text-2xs font-medium text-muted-foreground">
            Image URL
          </span>
          <input
            className={FIELD_CLASS}
            data-testid="emoji-url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            value={url}
          />
        </label>
        <button
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          data-testid="add-emoji"
          disabled={!valid || save.isPending}
          type="submit"
        >
          {save.isPending ? "Saving…" : "Add"}
        </button>
      </form>

      <p className="text-2xs text-muted-foreground">
        {duplicate
          ? "You already have an emoji with that shortcode."
          : "Lowercase letters, numbers and underscores. Upload the image first — anything reachable over HTTPS works."}
      </p>
    </div>
  );
}
