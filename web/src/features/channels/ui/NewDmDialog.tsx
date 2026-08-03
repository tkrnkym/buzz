import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { MAX_DM_PARTICIPANTS } from "@/features/channels/channel-ops";
import { UserPicker } from "@/features/directory/ui/UserPicker";
import { useDirectory } from "@/features/directory/use-directory";
import { normalizePubkey } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { truncatePubkey } from "@/shared/lib/pubkey";

/**
 * Start a direct message.
 *
 * Search first, paste second. The directory is built from the member lists of
 * the channels this reader is in, so it finds the people they actually talk to —
 * but it cannot find someone they share no channel with, because the relay does
 * not let a plain member enumerate a community they are not part of. A pasted
 * public key therefore stays a first-class way in rather than a fallback for a
 * broken search.
 */

/** A 64-character hex key, the only form a paste can take. */
const HEX_PUBKEY = /^[0-9a-f]{64}$/;

interface Recipient {
  pubkey: string;
  label: string;
}

export function NewDmDialog({
  error,
  onClose,
  onOpen,
  pending,
}: {
  error?: string | null;
  onClose: () => void;
  onOpen: (pubkeys: string[]) => void;
  pending?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickerKeyHandler = useRef<((event: KeyboardEvent) => boolean) | null>(
    null,
  );
  const directory = useDirectory();
  const profiles = useProfiles([]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const chosen = useMemo(
    () => new Set(recipients.map((recipient) => recipient.pubkey)),
    [recipients],
  );
  // Already-chosen people leave the list, so picking twice cannot happen and the
  // count on the button is always what will be sent.
  const candidates = useMemo(
    () => directory.filter((entry) => !chosen.has(entry.pubkey)),
    [directory, chosen],
  );

  const full = recipients.length >= MAX_DM_PARTICIPANTS;
  const pasted = normalizePubkey(query);
  const pastedKey =
    HEX_PUBKEY.test(pasted) && !chosen.has(pasted) ? pasted : null;

  const add = (recipient: Recipient) => {
    if (full) return;
    setRecipients((current) =>
      current.some((existing) => existing.pubkey === recipient.pubkey)
        ? current
        : [...current, recipient],
    );
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Cancel"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="new-dm-title"
        aria-modal="true"
        className="relative w-full max-w-md rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
        data-testid="new-dm-dialog"
        role="dialog"
      >
        <h2 className="text-sm font-semibold" id="new-dm-title">
          New direct message
        </h2>
        <p className="mt-1 text-2xs text-muted-foreground">
          Search for people you share a channel with, or paste a public key — 64
          hex characters. Up to {MAX_DM_PARTICIPANTS} people.
        </p>

        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (recipients.length === 0) return;
            onOpen(recipients.map((recipient) => recipient.pubkey));
          }}
        >
          {recipients.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" data-testid="new-dm-chosen">
              {recipients.map((recipient) => (
                <li
                  className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1"
                  key={recipient.pubkey}
                >
                  <span className="max-w-40 truncate text-2xs text-secondary-foreground">
                    {recipient.label}
                  </span>
                  <button
                    aria-label={`Remove ${recipient.label}`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setRecipients((current) =>
                        current.filter(
                          (existing) => existing.pubkey !== recipient.pubkey,
                        ),
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

          <input
            aria-label="Search people"
            autoComplete="off"
            className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid="new-dm-search"
            disabled={full}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // The picker owns arrows and Enter while it is showing a match, so
              // Enter completes a name instead of submitting a half-filled form.
              if (pickerKeyHandler.current?.(event.nativeEvent)) {
                event.preventDefault();
                return;
              }
              if (event.key === "Enter" && pastedKey) {
                event.preventDefault();
                add({ pubkey: pastedKey, label: truncatePubkey(pastedKey) });
              }
            }}
            placeholder="Name or public key"
            ref={inputRef}
            value={query}
          />

          {pastedKey ? (
            <button
              className="rounded-md border border-border px-2.5 py-2 text-left text-2xs hover:bg-accent"
              data-testid="new-dm-add-pubkey"
              onClick={() =>
                add({ pubkey: pastedKey, label: truncatePubkey(pastedKey) })
              }
              type="button"
            >
              Add {truncatePubkey(pastedKey)}
            </button>
          ) : (
            !full && (
              <UserPicker
                emptyLabel={
                  query.trim()
                    ? "Nobody you share a channel with matches that. Paste their public key instead."
                    : "Nobody to show yet — join a channel, or paste a public key."
                }
                entries={candidates}
                onPick={(entry) =>
                  add({ pubkey: entry.pubkey, label: entry.label })
                }
                profiles={profiles}
                query={query}
                registerKeyHandler={(handler) => {
                  pickerKeyHandler.current = handler;
                }}
              />
            )
          )}

          {full && (
            <p className="text-2xs text-muted-foreground">
              That is the most people a direct message can hold.
            </p>
          )}
          {error && (
            <p className="text-2xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              data-testid="new-dm-submit"
              disabled={pending || recipients.length === 0}
              type="submit"
            >
              {pending ? "Opening…" : "Open"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
