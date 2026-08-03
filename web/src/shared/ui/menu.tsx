import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/shared/lib/cn";

/**
 * A small dropdown menu.
 *
 * The panel is portalled to `document.body` and positioned from the trigger's
 * rect. That is not indirection for its own sake — it is the only way the panel
 * reliably wins. Rendered in place, it inherits whatever stacking context and
 * `overflow` its ancestors have: inside a message row's action bar it is trapped
 * in that bar's z-index, so the *next* row's bar paints over it and swallows the
 * clicks, and inside a scrolling timeline it gets clipped at the edge. Both of
 * those were real, and neither is fixable with a bigger `z-index`.
 *
 * Flat by design. The desktop client used nested hover submenus for things like a
 * timeout duration, which is close to unusable with a touch screen or a keyboard,
 * so a group of choices is rendered inline under a heading instead.
 *
 * Closes on Escape, on a click outside, on a scroll (the anchor has moved), and
 * after any item runs.
 */
export function Menu({
  align = "end",
  children,
  label,
  testId,
  trigger,
}: {
  align?: "start" | "end";
  /** Rendered inside the panel. Use {@link MenuItem} and {@link MenuGroup}. */
  children: (close: () => void) => React.ReactNode;
  label: string;
  testId?: string;
  trigger: React.ReactNode;
}) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const open = position !== null;

  const close = useCallback(() => setPosition(null), []);

  const openAt = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Measured against the viewport because the panel is fixed. Clamped so a
    // trigger near the right edge does not push the panel off screen.
    const width = 192;
    const left =
      align === "end"
        ? Math.min(rect.right - width, window.innerWidth - width - 8)
        : rect.left;
    setPosition({ top: rect.bottom + 4, left: Math.max(8, left) });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    // The anchor is measured once, so a scroll would leave the panel behind. A
    // menu that follows its trigger mid-scroll is worse than one that closes.
    const onScrollOrResize = () => close();
    // Capture, so a click on something that stops propagation still dismisses.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [close, open]);

  return (
    <>
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4"
        data-testid={testId}
        onClick={() => (open ? close() : openAt())}
        ref={triggerRef}
        type="button"
      >
        {trigger}
      </button>

      {position !== null &&
        createPortal(
          <div
            className="fixed z-50 w-48 rounded-lg border border-border bg-background p-1 shadow-lg"
            data-testid={testId ? `${testId}-panel` : undefined}
            id={panelId}
            ref={panelRef}
            role="menu"
            style={{ top: position.top, left: position.left }}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

/** One action in a {@link Menu}. */
export function MenuItem({
  children,
  destructive = false,
  disabled = false,
  icon,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs transition-colors disabled:opacity-50",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "hover:bg-accent",
      )}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {icon && <span className="shrink-0 [&>svg]:size-3.5">{icon}</span>}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

/**
 * A labelled row of related choices — a duration to pick, a severity to choose.
 *
 * Inline rather than a submenu; see the note on {@link Menu}.
 */
export function MenuGroup({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="mt-1 border-t border-border pt-1 first:mt-0 first:border-t-0 first:pt-0">
      <p className="px-2 py-1 text-badge font-medium text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1 px-1 pb-1">{children}</div>
    </div>
  );
}

/** A compact choice inside a {@link MenuGroup}. */
export function MenuChoice({
  children,
  disabled = false,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      className="rounded-md border border-border px-2 py-1 text-badge transition-colors hover:bg-accent disabled:opacity-50"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * A divider between groups of items.
 *
 * An `<hr>` rather than a `div` with `role="separator"`: the role by itself is
 * the focusable, value-carrying kind of separator (a splitter), which is not
 * what this is.
 */
export function MenuSeparator() {
  return <hr className="my-1 border-t border-border" />;
}
