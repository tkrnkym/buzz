import { formatDayHeading } from "@/features/messages/lib/date-formatters";

/**
 * Date separator, ported from the desktop client.
 *
 * The label is computed here rather than in the derivation so it resolves
 * against the current clock — a tab left open overnight would otherwise keep
 * calling yesterday "Today".
 *
 * It scrolls with the timeline rather than pinning. Pinning it was possible only
 * while every row was in the DOM: the virtualized list positions items itself,
 * and a `sticky` child of a transformed container sticks to nothing. The
 * floating pill above the list took over the job of telling a reader which day
 * they are in — see `DayPill`.
 *
 * A real heading rather than a labelled div: a screen-reader user navigating by
 * heading gets the day boundaries, which is the same affordance the pill gives a
 * sighted one.
 */
export function DayDivider({ headingTimestamp }: { headingTimestamp: number }) {
  const label = formatDayHeading(headingTimestamp);
  return (
    <div
      className="pointer-events-none flex justify-center py-1"
      data-day-label={label}
      data-testid="message-timeline-day-divider"
    >
      <h2 className="shrink-0 rounded-full border border-border/70 bg-background px-2.5 py-1 text-2xs font-medium tracking-[0.02em] text-muted-foreground/70">
        {label}
      </h2>
    </div>
  );
}

/**
 * The day the reader is currently looking at, floating over the timeline.
 *
 * Hidden when the reader is at the very top, where the first day's own divider
 * is on screen and a duplicate directly above it would read as a rendering bug.
 */
export function DayPill({
  headingTimestamp,
}: {
  headingTimestamp: number | null;
}) {
  if (headingTimestamp === null) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center py-1"
      data-testid="message-timeline-day-pill"
    >
      <span className="shrink-0 rounded-full border border-border/70 bg-background px-2.5 py-1 text-2xs font-medium tracking-[0.02em] text-muted-foreground/70 shadow-sm">
        {formatDayHeading(headingTimestamp)}
      </span>
    </div>
  );
}
