import { Link } from "@tanstack/react-router";
import { Check, Settings, Smile } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  PRESENCE_LABELS,
  PRESENCE_STATUSES,
  type PresenceStatus,
} from "@/features/chat/presence";
import type { UserStatus } from "@/features/profile/user-status";
import { cn } from "@/shared/lib/cn";

const ROW_CLASS =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Statuses offered as one-click presets, mirroring the desktop client's. */
const STATUS_PRESETS: { emoji: string; text: string }[] = [
  { emoji: "💬", text: "Available" },
  { emoji: "📅", text: "In a meeting" },
  { emoji: "🎧", text: "Focusing" },
  { emoji: "🌴", text: "On holiday" },
];

/**
 * The menu behind the sidebar profile card, ported from the desktop client.
 *
 * Closes on outside click and on Escape, and is rendered only while open — a
 * hidden menu that still holds focus is how a keyboard user ends up trapped in
 * something they cannot see.
 */
export function ProfilePopover({
  currentStatus,
  onClearUserStatus,
  onClose,
  onSetPresence,
  onSetUserStatus,
  presencePending,
  userStatus,
}: {
  currentStatus: PresenceStatus;
  onClearUserStatus: () => void;
  onClose: () => void;
  onSetPresence: (status: PresenceStatus) => void;
  onSetUserStatus: (input: { text: string; emoji: string }) => void;
  presencePending?: boolean;
  userStatus: UserStatus | null;
}) {
  const [draft, setDraft] = useState(userStatus?.text ?? "");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !ref.current?.contains(event.target)
      ) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      aria-label="Profile menu"
      className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
      data-testid="profile-popover"
      ref={ref}
      role="dialog"
    >
      <p className="px-2 pb-1 pt-0.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        Presence
      </p>
      {PRESENCE_STATUSES.map((status) => (
        <button
          aria-pressed={status === currentStatus}
          className={ROW_CLASS}
          data-testid={`set-presence-${status}`}
          disabled={presencePending}
          key={status}
          onClick={() => onSetPresence(status)}
          type="button"
        >
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              status === "online"
                ? "bg-primary"
                : status === "away"
                  ? "bg-muted-foreground"
                  : "border border-muted-foreground",
            )}
          />
          <span className="flex-1">{PRESENCE_LABELS[status]}</span>
          {status === currentStatus && (
            <Check aria-hidden className="size-3.5 shrink-0 text-primary" />
          )}
        </button>
      ))}

      <div aria-hidden className="my-1 h-px bg-border" />

      <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        Status
      </p>
      <form
        className="flex items-center gap-1 px-1 pb-1"
        onSubmit={(event) => {
          event.preventDefault();
          const text = draft.trim();
          if (text) {
            onSetUserStatus({ text, emoji: userStatus?.emoji ?? "💬" });
          } else {
            onClearUserStatus();
          }
          onClose();
        }}
      >
        <Smile aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          aria-label="Set a status"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="user-status-input"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="What are you up to?"
          value={draft}
        />
      </form>
      {STATUS_PRESETS.map((preset) => (
        <button
          className={ROW_CLASS}
          data-testid={`status-preset-${preset.text}`}
          key={preset.text}
          onClick={() => {
            onSetUserStatus(preset);
            onClose();
          }}
          type="button"
        >
          <span aria-hidden className="w-4 shrink-0 text-center">
            {preset.emoji}
          </span>
          <span className="flex-1 text-2xs">{preset.text}</span>
        </button>
      ))}
      {userStatus && (
        <button
          className={cn(ROW_CLASS, "text-2xs text-muted-foreground")}
          data-testid="clear-user-status"
          onClick={() => {
            onClearUserStatus();
            onClose();
          }}
          type="button"
        >
          <span aria-hidden className="w-4 shrink-0" />
          Clear status
        </button>
      )}

      <div aria-hidden className="my-1 h-px bg-border" />

      <Link
        className={ROW_CLASS}
        onClick={onClose}
        params={{ panel: "profile" }}
        to="/settings/$panel"
      >
        <Settings aria-hidden className="size-4 shrink-0" />
        Settings
      </Link>
    </div>
  );
}
