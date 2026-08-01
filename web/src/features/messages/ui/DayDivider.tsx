import { formatDayHeading } from "@/features/messages/lib/date-formatters";

/**
 * Sticky date separator, ported from the desktop client.
 *
 * The label is computed here rather than in the derivation so it resolves
 * against the current clock — a tab left open overnight would otherwise keep
 * calling yesterday "Today". It stays pinned while its day scrolls past, which
 * is what lets a reader scrolling through history always know where they are,
 * and it is scoped to its own day section so the next day's heading pushes it
 * away rather than covering it.
 *
 * A real heading rather than a labelled div: a screen-reader user navigating by
 * heading gets the day boundaries, which is the same affordance the pinned pill
 * gives a sighted one.
 */
export function DayDivider({ headingTimestamp }: { headingTimestamp: number }) {
  const label = formatDayHeading(headingTimestamp);
  return (
    <div
      className="pointer-events-none sticky top-0 z-20 flex justify-center py-1"
      data-day-label={label}
      data-testid="message-timeline-day-divider"
    >
      <h2 className="shrink-0 rounded-full border border-border/70 bg-background px-2.5 py-1 text-2xs font-medium tracking-[0.02em] text-muted-foreground/70">
        {label}
      </h2>
    </div>
  );
}
