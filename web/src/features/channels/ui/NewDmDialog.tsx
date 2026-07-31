import { useEffect, useRef, useState } from "react";

import { MAX_DM_PARTICIPANTS } from "@/features/channels/channel-ops";

/**
 * Start a direct message, ported in intent from the desktop client's new-message
 * screen.
 *
 * That screen searched a user directory. This relay exposes no such search to a
 * plain member, so the honest input is a public key — and the copy says so rather
 * than presenting an empty autocomplete that never finds anyone. Several keys are
 * accepted, which is how a group DM is opened.
 */
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
  const [raw, setRaw] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Split on anything that is not hex, so a list pasted with commas, newlines, or
  // spaces all work without the reader having to know which we wanted.
  const pubkeys = [
    ...new Set(
      raw
        .toLowerCase()
        .split(/[^0-9a-f]+/)
        .filter((token) => token.length === 64),
    ),
  ];
  const looksIncomplete = raw.trim().length > 0 && pubkeys.length === 0;

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
          Paste one or more public keys — 64 hex characters each. Up to{" "}
          {MAX_DM_PARTICIPANTS} people.
        </p>

        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (pubkeys.length === 0) return;
            onOpen(pubkeys);
          }}
        >
          <textarea
            aria-label="Public keys"
            className="min-h-20 w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 font-mono text-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid="new-dm-pubkeys"
            onChange={(event) => setRaw(event.target.value)}
            value={raw}
          />

          {pubkeys.length > 0 && (
            <p className="text-2xs text-muted-foreground">
              {pubkeys.length === 1
                ? "1 recipient"
                : `${pubkeys.length} recipients`}
            </p>
          )}
          {looksIncomplete && (
            <p className="text-2xs text-muted-foreground">
              That is not a 64-character hex key yet.
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
              disabled={pending || pubkeys.length === 0}
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
