import assert from "node:assert/strict";
import test from "node:test";

import {
  dueCount,
  formatDueLabel,
  isDue,
  sortReminders,
  SNOOZE_OPTIONS,
} from "./reminder-model.ts";

const NOW = 1_700_000_000;
const reminder = (overrides) => ({
  id: "r",
  subject: "",
  channel: "dev",
  dueAt: NOW,
  createdAt: NOW - 1000,
  done: false,
  ...overrides,
});

test("a reminder is due once its moment has passed", () => {
  assert.equal(isDue(reminder({ dueAt: NOW - 1 }), NOW), true);
  assert.equal(isDue(reminder({ dueAt: NOW + 1 }), NOW), false);
});

test("a finished reminder is never due", () => {
  assert.equal(isDue(reminder({ dueAt: NOW - 1000, done: true }), NOW), false);
});

test("past and future are worded differently", () => {
  // Same distance, different thing — one is waiting on you.
  assert.equal(formatDueLabel(NOW + 7_200, NOW), "あと 2時間");
  assert.equal(formatDueLabel(NOW - 7_200, NOW), "2時間前");
});

test("a due time inside a minute still reads as a minute", () => {
  // "0分前" is not a thing anyone says.
  assert.equal(formatDueLabel(NOW - 5, NOW), "1分前");
});

test("days are used past a day", () => {
  assert.equal(formatDueLabel(NOW + 60 * 60 * 24 * 3, NOW), "あと 3日");
});

test("snooze offers a short, a medium and two long options", () => {
  assert.equal(SNOOZE_OPTIONS.length, 4);
  assert.ok(SNOOZE_OPTIONS.every((option) => option.minutes > 0));
});

test("due comes first, done sinks to the bottom", () => {
  const sorted = sortReminders(
    [
      reminder({ id: "done", done: true, dueAt: NOW - 9_000 }),
      reminder({ id: "later", dueAt: NOW + 9_000 }),
      reminder({ id: "due", dueAt: NOW - 100 }),
    ],
    NOW,
  );
  assert.deepEqual(
    sorted.map((entry) => entry.id),
    ["due", "later", "done"],
  );
});

test("a finished reminder stays in the list", () => {
  // The list is also the record of what was dealt with.
  const sorted = sortReminders([reminder({ id: "done", done: true })], NOW);
  assert.equal(sorted.length, 1);
});

test("the due count is what is waiting on the reader", () => {
  assert.equal(
    dueCount(
      [
        reminder({ dueAt: NOW - 1 }),
        reminder({ dueAt: NOW + 1 }),
        reminder({ dueAt: NOW - 1, done: true }),
      ],
      NOW,
    ),
    1,
  );
});
