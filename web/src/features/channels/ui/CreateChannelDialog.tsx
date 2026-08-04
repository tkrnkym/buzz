import { Globe, Hash, Lock, MessagesSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  canonicalChannelName,
  type ChannelKind,
  type ChannelVisibility,
} from "@/features/channels/channel-ops";
import { cn } from "@/shared/lib/cn";
import {
  Field,
  FIELD_CONTROL_CLASS,
  ValueRow,
  type ValueOption,
} from "@/shared/ui/field-row";

const TYPE_OPTIONS: ReadonlyArray<ValueOption<ChannelKind>> = [
  { value: "stream", label: "Ongoing", icon: Hash, hint: "A live timeline" },
  {
    value: "forum",
    label: "Forum",
    icon: MessagesSquare,
    hint: "Threaded posts",
  },
];

const VISIBILITY_OPTIONS: ReadonlyArray<ValueOption<ChannelVisibility>> = [
  {
    value: "open",
    label: "Public",
    icon: Globe,
    hint: "Anyone here can find and join",
  },
  { value: "private", label: "Private", icon: Lock, hint: "Invite only" },
];

/**
 * Create-channel dialog, ported from the desktop client.
 *
 * The name preview is the point of showing one: the relay applies its own
 * canonicalization, so a reader typing `#Design Review` should see the room they
 * are about to get before they commit. The preview runs the *same* rule the
 * relay does — see `canonicalChannelName`.
 *
 * Type and visibility are value rows rather than the pair of tiles this dialog
 * used to show. Tiles spend the dialog's whole width on two options and force
 * every choice to be visible at once, which does not survive a third one; a row
 * states the question and its current answer in a single line, which is the form
 * the original used and the reason `shared/ui/field-row.tsx` exists.
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
        className="relative w-full max-w-md rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-xl"
        data-testid="create-channel-dialog"
        role="dialog"
      >
        <h2 className="text-xl font-semibold" id="create-channel-title">
          Create a new channel
        </h2>

        <form
          className="mt-5 flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canonical) return;
            onCreate({ name, about, visibility, channelType });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Field htmlFor="create-channel-name" label="Name">
              <input
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                className={cn(FIELD_CONTROL_CLASS, "h-11 px-3")}
                data-testid="create-channel-name"
                id="create-channel-name"
                onChange={(event) => setName(event.target.value)}
                placeholder={
                  channelType === "forum"
                    ? "design-discussions"
                    : "release-notes"
                }
                ref={nameRef}
                spellCheck={false}
                value={name}
              />
            </Field>
            {renamed && (
              <span
                className="text-2xs text-muted-foreground"
                data-testid="create-channel-name-preview"
              >
                Will be created as{" "}
                <code className="font-mono">{canonical}</code>
              </span>
            )}
          </div>

          <Field htmlFor="create-channel-about" label="Description" optional>
            <textarea
              className={cn(FIELD_CONTROL_CLASS, "min-h-20 resize-none p-3")}
              data-testid="create-channel-about"
              id="create-channel-about"
              onChange={(event) => setAbout(event.target.value)}
              placeholder="What this channel is for"
              rows={2}
              value={about}
            />
          </Field>

          <ValueRow
            disabled={pending}
            label="Channel type"
            onChange={setChannelType}
            options={TYPE_OPTIONS}
            testId="create-channel-type"
            value={channelType}
          />

          <ValueRow
            disabled={pending}
            label="Visibility"
            onChange={setVisibility}
            options={VISIBILITY_OPTIONS}
            testId="create-channel-visibility"
            value={visibility}
          />

          {error && (
            <p className="text-2xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              data-testid="create-channel-submit"
              disabled={pending || canonical.length === 0}
              type="submit"
            >
              {pending ? "Creating…" : "Create channel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
