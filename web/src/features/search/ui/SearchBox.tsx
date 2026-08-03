import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

/**
 * The search input.
 *
 * Submitting writes the query into the URL rather than into local state, which
 * is what makes a result set linkable, survive a reload, and land in history so
 * Back leaves search instead of leaving the app.
 */
export function SearchBox({
  channelId,
  query,
}: {
  channelId: string | null;
  /** The committed query, from the URL. */
  query: string;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(query);

  // Follow the URL, so Back and a shared link both put the committed query back
  // in the box instead of leaving stale text next to fresh results.
  useEffect(() => setDraft(query), [query]);

  const commit = (next: string) => {
    // `m` is dropped on purpose: a search replaces the anchored-message view, so
    // keeping it would leave the URL claiming both.
    if (channelId) {
      void navigate({
        to: "/c/$channelId",
        params: { channelId },
        search: next ? { q: next } : {},
      });
    } else {
      void navigate({ to: "/", search: next ? { q: next } : {} });
    }
  };

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    commit(draft.trim());
  };

  const label = channelId ? "Search this channel" : "Search messages";

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={draft}
          onChange={(changeEvent) => setDraft(changeEvent.target.value)}
          placeholder={label}
          aria-label={label}
          className="h-8 w-44 rounded-md border border-border bg-background pl-7 pr-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      {query && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            commit("");
          }}
          aria-label="Clear search"
          className="text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    </form>
  );
}
