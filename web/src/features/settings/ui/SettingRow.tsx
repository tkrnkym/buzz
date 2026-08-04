import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

/**
 * The shape every settings screen is made of.
 *
 * A title, a line explaining what it does, and the control on the right. It is one
 * component because it is one pattern repeated on every screen — and because the
 * explanation is not optional: a row that says only "Agent text to speech" makes
 * the reader guess when it happens, which is exactly the question the second line
 * answers ("in the order they arrive").
 *
 * The control sits in a slot rather than being a `checked`/`onChange` pair, because
 * the screens put very different things there: a switch, a select plus a preview
 * button plus an upload, a dropdown, a destructive button.
 */
export function SettingRow({
  children,
  className,
  description,
  testId,
  title,
}: {
  /** The control. Right-aligned, and never allowed to shrink. */
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  testId?: string;
  title: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3.5",
        className,
      )}
      {...(testId ? { "data-testid": testId } : {})}
    >
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="mt-0.5 text-2xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}

/**
 * A card of rows.
 *
 * Rows are grouped into a bordered card with hairlines between them rather than
 * floating on the page: on a screen with eight of them, the card is what says which
 * ones belong together — and the hairline is what stops a two-line row from reading
 * as two rows.
 */
export function SettingCard({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card [&>*+*]:border-t [&>*+*]:border-border/60",
        className,
      )}
      {...(testId ? { "data-testid": testId } : {})}
    >
      {children}
    </div>
  );
}

/**
 * A heading between cards.
 *
 * Used where a screen has a second, unrelated list under the first — "My emoji"
 * below the upload form, "Sign out" below the profile. Not a card border, because
 * the two are not alternatives; the reader is meant to read past the first.
 */
export function SettingGroupHeading({ children }: { children: ReactNode }) {
  return <h2 className="mt-2 text-base font-semibold">{children}</h2>;
}
