import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/shared/lib/cn";

/**
 * A modal, built on the native `<dialog>` element.
 *
 * `showModal()` is doing real work here, not saving a dependency: it moves focus
 * into the dialog, traps it there, makes everything behind it inert to both the
 * pointer and the screen reader, and closes on Escape. A hand-rolled overlay has
 * to reimplement all four, and usually reimplements two.
 *
 * The consequence to know about: the backdrop is `::backdrop`, not a child, so it
 * cannot be styled through a wrapper — see `web/src/index.css`.
 */
export function Dialog({
  children,
  className,
  description,
  footer,
  labelledBy,
  onClose,
  open,
  testId,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  description?: string;
  footer?: React.ReactNode;
  /** Overrides the generated heading id, for a caller providing its own title. */
  labelledBy?: string;
  onClose: () => void;
  open: boolean;
  testId?: string;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // Driven by the prop rather than by the element's own state: `showModal` and
  // `close` are imperative, so the two have to be reconciled somewhere, and
  // doing it here keeps `open` the single source of truth for the caller.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const headingId = labelledBy ?? `${testId ?? "dialog"}-title`;

  return (
    <dialog
      aria-labelledby={headingId}
      className={cn(
        // `open:` variants because a closed `<dialog>` is `display: none`, and a
        // flex column on a hidden element would still win the cascade.
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-background p-0 text-foreground shadow-lg",
        className,
      )}
      data-testid={testId}
      // Fires for Escape as well as `close()`, which is what keeps the caller's
      // `open` in step when the platform closes the dialog on its own.
      onClose={onClose}
      ref={ref}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold" id={headingId}>
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <button
          aria-label="閉じる"
          className="-mr-1 -mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          data-testid={testId ? `${testId}-close` : undefined}
          onClick={onClose}
          type="button"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div className="px-4 py-4">{children}</div>

      {footer && (
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
