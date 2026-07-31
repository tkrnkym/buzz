import { Bell, BellOff, Link2, LogOut, Star, StarOff } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/shared/lib/cn";

const ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-3.5 [&>svg]:shrink-0";

/**
 * The per-channel menu, ported from the desktop client's channel context menu.
 *
 * Positioned by the caller, dismissed on outside click or Escape, and rendered
 * only while open — a hidden menu that still holds focus is how a keyboard user
 * ends up somewhere they cannot see.
 *
 * Mute and star are local preferences (see `channel-flags`); leaving is a relay
 * command. The destructive item is last and separated, so it is not adjacent to
 * the one a reader reaches for most.
 */
export function ChannelRowMenu({
  isMuted,
  isStarred,
  onClose,
  onCopyLink,
  onLeave,
  onToggleMute,
  onToggleStar,
}: {
  isMuted: boolean;
  isStarred: boolean;
  onClose: () => void;
  onCopyLink: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleStar: () => void;
}) {
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

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <div
      aria-label="Channel actions"
      className="absolute right-1 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      data-testid="channel-row-menu"
      ref={ref}
      role="menu"
    >
      <button
        className={ITEM_CLASS}
        data-testid="menu-toggle-star"
        onClick={run(onToggleStar)}
        role="menuitem"
        type="button"
      >
        {isStarred ? <StarOff /> : <Star />}
        {isStarred ? "Remove star" : "Star channel"}
      </button>
      <button
        className={ITEM_CLASS}
        data-testid="menu-toggle-mute"
        onClick={run(onToggleMute)}
        role="menuitem"
        type="button"
      >
        {isMuted ? <Bell /> : <BellOff />}
        {isMuted ? "Unmute" : "Mute channel"}
      </button>
      <button
        className={ITEM_CLASS}
        data-testid="menu-copy-link"
        onClick={run(onCopyLink)}
        role="menuitem"
        type="button"
      >
        <Link2 />
        Copy link
      </button>

      <div aria-hidden className="my-1 h-px bg-border" />

      <button
        className={cn(
          ITEM_CLASS,
          "hover:bg-destructive/10 hover:text-destructive",
        )}
        data-testid="menu-leave-channel"
        onClick={run(onLeave)}
        role="menuitem"
        type="button"
      >
        <LogOut />
        Leave channel
      </button>
    </div>
  );
}
