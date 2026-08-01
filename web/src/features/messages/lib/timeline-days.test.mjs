import assert from "node:assert/strict";
import test from "node:test";

import { dayTimestampsByIndex, pillDayTimestamp } from "./timeline-days.ts";

const divider = (at) => ({
  kind: "day-divider",
  key: `day-${at}`,
  headingTimestamp: at,
});
const message = (id) => ({
  kind: "message",
  key: id,
  row: { message: { id } },
  isContinuation: false,
  isFollowedByContinuation: false,
});

test("every index carries the day in effect above it", () => {
  const days = dayTimestampsByIndex([
    divider(100),
    message("a"),
    message("b"),
    divider(200),
    message("c"),
  ]);
  assert.deepEqual(days, [100, 100, 100, 200, 200]);
});

test("an item before any divider has no day rather than an invented one", () => {
  assert.deepEqual(dayTimestampsByIndex([message("a"), divider(100)]), [
    null,
    100,
  ]);
});

test("an empty timeline has no days", () => {
  assert.deepEqual(dayTimestampsByIndex([]), []);
});

test("the pill is hidden at the very top", () => {
  // The first day's own divider is on screen there; repeating it directly above
  // reads as a rendering bug.
  assert.equal(pillDayTimestamp([100, 100], 0), null);
});

test("the pill reports the day of the top item", () => {
  assert.equal(pillDayTimestamp([100, 100, 200, 200], 3), 200);
});

test("an index past the end clamps to the last day", () => {
  assert.equal(pillDayTimestamp([100, 200], 99), 200);
});

test("a position with no day above it shows nothing", () => {
  assert.equal(pillDayTimestamp([null, null], 1), null);
});
