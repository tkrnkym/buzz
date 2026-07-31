/**
 * Date and time formatting for the message timeline, ported from the desktop
 * client.
 *
 * Two rules the timeline depends on:
 *
 * - Day headings are computed from the **current** clock, not baked at derive
 *   time, so a tab left open overnight does not keep calling yesterday "Today".
 *   `formatDayHeading` therefore takes only a timestamp and is called during
 *   render.
 * - Day identity is local midnight (`startOfLocalDaySeconds`), so prepending
 *   older history into a day does not change that day's key and the divider
 *   stays put.
 */

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const FULL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
});

const LONG_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
});

const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

/** Narrow no-break space and friends: what `Intl` puts before AM/PM. */
const DAY_PERIOD_SUFFIX_RE = /[\s  ]*(?:AM|PM)$/i;

/** Short clock time, e.g. "2:34 PM". */
export function formatTime(unixSeconds: number): string {
  return TIME_FORMATTER.format(new Date(unixSeconds * 1_000));
}

/** The same time with the AM/PM marker dropped, e.g. "2:34". */
export function formatTimeWithoutDayPeriod(time: string): string {
  return time.replace(DAY_PERIOD_SUFFIX_RE, "").trim();
}

/** Full date and time, for the timestamp tooltip. */
export function formatFullDateTime(unixSeconds: number): string {
  return FULL_DATE_TIME_FORMATTER.format(new Date(unixSeconds * 1_000));
}

/**
 * Day-divider label: "Today", "Yesterday", "Monday, March 31st", or the same
 * with a year when it is not the current one.
 */
export function formatDayHeading(
  unixSeconds: number,
  now: Date = new Date(),
): string {
  const date = new Date(unixSeconds * 1_000);

  if (isSameDayDate(date, now)) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDayDate(date, yesterday)) return "Yesterday";

  const label = `${WEEKDAY_FORMATTER.format(date)}, ${formatMonthDayOrdinal(
    date,
    LONG_MONTH_FORMATTER,
  )}`;
  return date.getFullYear() === now.getFullYear()
    ? label
    : `${label}, ${date.getFullYear()}`;
}

/** True when two unix-second timestamps fall on the same local calendar day. */
export function isSameDay(left: number, right: number): boolean {
  return isSameDayDate(new Date(left * 1_000), new Date(right * 1_000));
}

/**
 * Local midnight for the day containing `unixSeconds`.
 *
 * A stable identity for a day group: every timestamp in that day maps to the
 * same value, so prepending older history into the day does not renumber it.
 */
export function startOfLocalDaySeconds(unixSeconds: number): number {
  const date = new Date(unixSeconds * 1_000);
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1_000);
}

/** Short month and ordinal day, e.g. "May 19th". */
export function formatShortMonthDayOrdinal(unixSeconds: number): string {
  return formatMonthDayOrdinal(
    new Date(unixSeconds * 1_000),
    SHORT_MONTH_FORMATTER,
  );
}

/**
 * Thread-summary time: "3 hours ago" up to a week, then "on May 19th".
 *
 * Expanded units rather than "3h" — the summary row is prose, and a reader
 * scanning a timeline should not have to decode an abbreviation.
 */
export function formatThreadSummaryLastReplyTime(
  unixSeconds: number,
  nowSeconds: number = Date.now() / 1_000,
): string {
  const diff = Math.max(0, nowSeconds - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3_600) return formatAgo(Math.floor(diff / 60), "minute");
  if (diff < 86_400) return formatAgo(Math.floor(diff / 3_600), "hour");
  if (diff < 604_800) return formatAgo(Math.floor(diff / 86_400), "day");
  return `on ${formatShortMonthDayOrdinal(unixSeconds)}`;
}

function isSameDayDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatMonthDayOrdinal(
  date: Date,
  monthFormatter: Intl.DateTimeFormat,
): string {
  const day = date.getDate();
  return `${monthFormatter.format(date)} ${day}${ordinalSuffix(day)}`;
}

function formatAgo(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

function ordinalSuffix(day: number): string {
  // 11th/12th/13th, not 11st/12nd/13rd.
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
