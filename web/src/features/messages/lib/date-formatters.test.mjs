import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDayHeading,
  formatShortMonthDayOrdinal,
  formatThreadSummaryLastReplyTime,
  formatTimeWithoutDayPeriod,
  isSameDay,
  startOfLocalDaySeconds,
} from "@/features/messages/lib/date-formatters";

/** Local-midnight-safe timestamp builder, so these do not depend on the TZ. */
const at = (year, month, day, hour = 12, minute = 0) =>
  Math.floor(new Date(year, month - 1, day, hour, minute).getTime() / 1000);

test("today and yesterday are named, not dated", () => {
  const now = new Date(2026, 2, 31, 15, 0);
  assert.equal(formatDayHeading(at(2026, 3, 31, 9), now), "Today");
  assert.equal(formatDayHeading(at(2026, 3, 30, 9), now), "Yesterday");
});

test("an older day in the same year omits the year", () => {
  const now = new Date(2026, 2, 31, 15, 0);
  assert.equal(formatDayHeading(at(2026, 3, 2, 9), now), "Monday, March 2nd");
});

test("a day in another year carries it", () => {
  const now = new Date(2026, 2, 31, 15, 0);
  assert.equal(
    formatDayHeading(at(2025, 3, 31, 9), now),
    "Monday, March 31st, 2025",
  );
});

test("ordinals follow English rules, including the teens", () => {
  assert.equal(formatShortMonthDayOrdinal(at(2026, 5, 1)), "May 1st");
  assert.equal(formatShortMonthDayOrdinal(at(2026, 5, 2)), "May 2nd");
  assert.equal(formatShortMonthDayOrdinal(at(2026, 5, 3)), "May 3rd");
  assert.equal(formatShortMonthDayOrdinal(at(2026, 5, 4)), "May 4th");
  // 11th/12th/13th, not 11st/12nd/13rd.
  assert.equal(formatShortMonthDayOrdinal(at(2026, 5, 11)), "May 11th");
  assert.equal(formatShortMonthDayOrdinal(at(2026, 5, 12)), "May 12th");
  assert.equal(formatShortMonthDayOrdinal(at(2026, 5, 13)), "May 13th");
  assert.equal(formatShortMonthDayOrdinal(at(2026, 5, 21)), "May 21st");
  assert.equal(formatShortMonthDayOrdinal(at(2026, 5, 22)), "May 22nd");
});

test("every timestamp in a day shares one day key", () => {
  // This is what keeps a day divider from renumbering when older history is
  // prepended into the same day.
  const key = startOfLocalDaySeconds(at(2026, 3, 31, 0, 1));
  assert.equal(startOfLocalDaySeconds(at(2026, 3, 31, 23, 59)), key);
  assert.notEqual(startOfLocalDaySeconds(at(2026, 4, 1, 0, 1)), key);
});

test("same-day comparison is by local calendar day, not by 24-hour distance", () => {
  assert.ok(isSameDay(at(2026, 3, 31, 0, 30), at(2026, 3, 31, 23, 30)));
  // 2 hours apart, different days.
  assert.ok(!isSameDay(at(2026, 3, 31, 23, 30), at(2026, 4, 1, 1, 30)));
});

test("the AM/PM marker is stripped including the narrow space Intl emits", () => {
  assert.equal(formatTimeWithoutDayPeriod("2:34 PM"), "2:34");
  assert.equal(formatTimeWithoutDayPeriod("2:34 AM"), "2:34");
  assert.equal(formatTimeWithoutDayPeriod("14:34"), "14:34");
});

test("thread summary times step through units then fall back to a date", () => {
  const now = 1_800_000_000;
  assert.equal(formatThreadSummaryLastReplyTime(now - 5, now), "just now");
  assert.equal(formatThreadSummaryLastReplyTime(now - 60, now), "1 minute ago");
  assert.equal(
    formatThreadSummaryLastReplyTime(now - 180, now),
    "3 minutes ago",
  );
  assert.equal(
    formatThreadSummaryLastReplyTime(now - 3_600, now),
    "1 hour ago",
  );
  assert.equal(
    formatThreadSummaryLastReplyTime(now - 86_400, now),
    "1 day ago",
  );
  assert.match(
    formatThreadSummaryLastReplyTime(now - 604_800, now),
    /^on [A-Z][a-z]{2} \d{1,2}(st|nd|rd|th)$/,
  );
});

test("a reply timestamped in the future reads as just now, not negative", () => {
  const now = 1_800_000_000;
  assert.equal(formatThreadSummaryLastReplyTime(now + 500, now), "just now");
});
