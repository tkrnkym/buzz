import { useEffect, useMemo, useRef, useState } from "react";

import {
  searchDirectory,
  type DirectoryEntry,
} from "@/features/directory/directory-model";
import {
  resolveAvatarUrl,
  type ProfileLookup,
} from "@/features/profile/profile-model";
import { cn } from "@/shared/lib/cn";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

/**
 * A keyboard-navigable list of people, used by both the mention autocomplete and
 * the DM recipient picker.
 *
 * The selection index is clamped rather than reset when the query narrows: a
 * reader typing one more character expects the highlight to stay near where it
 * was, not to jump back to the top mid-keystroke.
 */
export function UserPicker({
  className,
  emptyLabel = "Nobody found.",
  entries,
  onPick,
  profiles,
  query,
  registerKeyHandler,
}: {
  className?: string;
  emptyLabel?: string;
  entries: DirectoryEntry[];
  onPick: (entry: DirectoryEntry) => void;
  profiles?: ProfileLookup;
  query: string;
  /**
   * Hands the caller a keydown handler for arrow/enter/escape.
   *
   * The list does not own the focus — the composer's textarea does, and taking
   * focus away from it to move a highlight would interrupt typing.
   */
  registerKeyHandler?: (
    handler: ((event: KeyboardEvent) => boolean) | null,
  ) => void;
}) {
  const hits = useMemo(() => searchDirectory(entries, query), [entries, query]);
  const [selected, setSelected] = useState(0);
  const hitsRef = useRef(hits);
  hitsRef.current = hits;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Clamp rather than reset, so narrowing the query does not throw the
  // highlight back to the top.
  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(hits.length - 1, 0)));
  }, [hits.length]);

  useEffect(() => {
    if (!registerKeyHandler) return;
    const handler = (event: KeyboardEvent): boolean => {
      const list = hitsRef.current;
      if (list.length === 0) return false;
      if (event.key === "ArrowDown") {
        setSelected((current) => (current + 1) % list.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((current) => (current - 1 + list.length) % list.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        setSelected((current) => {
          const entry = list[current];
          if (entry) onPickRef.current(entry);
          return current;
        });
        return true;
      }
      return false;
    };
    registerKeyHandler(handler);
    return () => registerKeyHandler(null);
  }, [registerKeyHandler]);

  if (hits.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-popover p-2 text-2xs text-muted-foreground shadow-lg",
          className,
        )}
        data-testid="user-picker-empty"
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      aria-label="People"
      className={cn(
        "max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg",
        className,
      )}
      data-testid="user-picker"
      // Listbox semantics rather than a plain list: the rows are options in a
      // single-select list, which is what makes `aria-selected` mean the
      // keyboard highlight. The options are the direct children, so there is no
      // list-item wrapper to describe.
      role="listbox"
    >
      {hits.map((entry, index) => (
        <button
          aria-selected={index === selected}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
            index === selected
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/60",
          )}
          data-testid={`user-picker-${entry.label}`}
          key={entry.pubkey}
          onClick={() => onPick(entry)}
          // The pointer moves the highlight, so clicking and typing agree about
          // which row is current.
          onMouseEnter={() => setSelected(index)}
          role="option"
          type="button"
        >
          <PubkeyAvatar
            avatarUrl={resolveAvatarUrl(entry.pubkey, profiles)}
            className="rounded-full"
            label={entry.label}
            pubkey={entry.pubkey}
            size="sm"
          />
          <span className="min-w-0 flex-1 truncate text-2xs font-medium">
            {entry.label}
          </span>
          {entry.handle && (
            <span className="shrink-0 text-2xs text-muted-foreground">
              @{entry.handle}
            </span>
          )}
          {(entry.role === "owner" || entry.role === "admin") && (
            <span className="shrink-0 rounded bg-secondary px-1 py-0.5 text-badge text-secondary-foreground">
              {entry.role}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
