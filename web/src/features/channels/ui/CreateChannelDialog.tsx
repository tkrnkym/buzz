import { useEffect, useRef, useState } from "react";

import {
  canonicalChannelName,
  type ChannelKind,
  type ChannelVisibility,
} from "@/features/channels/channel-ops";
import { cn } from "@/shared/lib/cn";

const FIELD_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Create-channel dialog, ported from the desktop client.
 *
 * The name preview is the point of showing one: the relay applies its own
 * canonicalization, so a reader typing `#Design Review` should see the room they
 * are about to get before they commit. The preview runs the *same* rule the
 * relay does — see `canonicalChannelName`.
 */
export function CreateChannelDialog({
  error,
  onClose,
  onCreate,
  pending,
}: {
  error?: string | null;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    about: string;
    visibility: ChannelVisibility;
    channelType: ChannelKind;
  }) => void;
  pending?: boolean;
}) {
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [visibility, setVisibility] = useState<ChannelVisibility>("open");
  const [channelType, setChannelType] = useState<ChannelKind>("stream");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const canonical = canonicalChannelName(name);
  const renamed = canonical !== name.trim() && canonical.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* A backdrop button rather than a click handler on the overlay div: this
          is a dismissal control, and it should be one for a keyboard too. */}
      <button
        aria-label="Cancel"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="create-channel-title"
        aria-modal="true"
        className="relative w-full max-w-md rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
        data-testid="create-channel-dialog"
        ref={panelRef}
        role="dialog"
      >
        <h2 className="text-sm font-semibold" id="create-channel-title">
          Create a channel
        </h2>

        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canonical) return;
            onCreate({ name, about, visibility, channelType });
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-muted-foreground">
              Name
            </span>
            <input
              className={FIELD_CLASS}
              data-testid="create-channel-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="design-review"
              ref={nameRef}
              value={name}
            />
            {renamed && (
              <span
                className="text-2xs text-muted-foreground"
                data-testid="create-channel-name-preview"
              >
                Will be created as{" "}
                <code className="font-mono">{canonical}</code>
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-2xs font-medium text-muted-foreground">
              Description
            </span>
            <input
              className={FIELD_CLASS}
              data-testid="create-channel-about"
              onChange={(event) => setAbout(event.target.value)}
              placeholder="What is this channel for?"
              value={about}
            />
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-2xs font-medium text-muted-foreground">
              Type
            </legend>
            <div className="flex gap-2">
              {(
                [
                  { value: "stream", label: "Stream", hint: "A live timeline" },
                  { value: "forum", label: "Forum", hint: "Threaded posts" },
                ] as const
              ).map((option) => (
                <button
                  aria-pressed={channelType === option.value}
                  className={cn(
                    "flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                    channelType === option.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent",
                  )}
                  data-testid={`create-channel-type-${option.value}`}
                  key={option.value}
                  onClick={() => setChannelType(option.value)}
                  type="button"
                >
                  <span className="text-2xs font-semibold">{option.label}</span>
                  <span className="text-2xs text-muted-foreground">
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-2xs font-medium text-muted-foreground">
              Visibility
            </legend>
            <div className="flex gap-2">
              {(
                [
                  {
                    value: "open",
                    label: "Open",
                    hint: "Anyone here can find and join",
                  },
                  {
                    value: "private",
                    label: "Private",
                    hint: "Invite only",
                  },
                ] as const
              ).map((option) => (
                <button
                  aria-pressed={visibility === option.value}
                  className={cn(
                    "flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                    visibility === option.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent",
                  )}
                  data-testid={`create-channel-visibility-${option.value}`}
                  key={option.value}
                  onClick={() => setVisibility(option.value)}
                  type="button"
                >
                  <span className="text-2xs font-semibold">{option.label}</span>
                  <span className="text-2xs text-muted-foreground">
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

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
              data-testid="create-channel-submit"
              disabled={pending || canonical.length === 0}
              type="submit"
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
