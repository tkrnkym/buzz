import { formatDayHeading } from "@/features/messages/lib/date-formatters";

/**
 * Sticky date separator, ported from the desktop client.
 *
 * The label is computed here rather than in the derivation so it resolves
 * against the current clock — a tab left open overnight would otherwise keep
 * calling yesterday "Today". It stays pinned while its day scrolls past, which
 * is what lets a reader scrolling through history always know where they are.
 */
export function DayDivider({ headingTimestamp }: { headingTimestamp: number }) {
  const label = formatDayHeading(headingTimestamp);
  return (
    <li
      aria-label={label}
      className="pointer-events-none sticky top-0 z-20 flex justify-center py-1"
      data-day-label={label}
      data-testid="message-timeline-day-divider"
    >
      <p className="shrink-0 rounded-full border border-border/70 bg-background px-2.5 py-1 text-2xs font-medium tracking-[0.02em] text-muted-foreground/70">
        {label}
      </p>
    </li>
  );
}
