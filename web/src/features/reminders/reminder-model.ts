/**
 * Presentation rules for reminders.
 *
 * A reminder is a message someone chose to come back to. The only judgement
 * this module makes is about time: whether one is due, and how to say when
 * without making the reader do arithmetic.
 */

import type { Reminder } from "@/mock/showcase";

/** Whether the reminder's moment has arrived. */
export function isDue(reminder: Reminder, nowSeconds: number): boolean {
  return !reminder.done && reminder.dueAt <= nowSeconds;
}

/**
 * "あと 2時間" / "3時間前" — which side of now the reminder sits on.
 *
 * The two are phrased differently on purpose: an overdue reminder and one due
 * later are the same distance but not the same thing, and a single "2時間"
 * would make them look identical in a list read at a glance.
 */
export function formatDueLabel(
  dueAtSeconds: number,
  nowSeconds: number,
): string {
  const delta = dueAtSeconds - nowSeconds;
  const magnitude = Math.abs(delta);
  const minutes = Math.round(magnitude / 60);

  const amount =
    minutes < 60
      ? `${Math.max(1, minutes)}分`
      : minutes < 60 * 24
        ? `${Math.floor(minutes / 60)}時間`
        : `${Math.floor(minutes / (60 * 24))}日`;

  return delta >= 0 ? `あと ${amount}` : `${amount}前`;
}

/** Snooze options, as the desktop client offered them. */
export const SNOOZE_OPTIONS: { label: string; minutes: number }[] = [
  { label: "20分後", minutes: 20 },
  { label: "1時間後", minutes: 60 },
  { label: "明日の朝", minutes: 60 * 14 },
  { label: "来週", minutes: 60 * 24 * 7 },
];

/**
 * Due first, then upcoming, with anything finished at the bottom.
 *
 * Done reminders stay in the list rather than disappearing: the list is also a
 * record of what was dealt with, and a reminder that vanishes on completion
 * takes the evidence with it.
 */
export function sortReminders(
  reminders: Reminder[],
  nowSeconds: number,
): Reminder[] {
  return [...reminders].sort((left, right) => {
    if (left.done !== right.done) return Number(left.done) - Number(right.done);
    const leftDue = isDue(left, nowSeconds);
    const rightDue = isDue(right, nowSeconds);
    if (leftDue !== rightDue) return Number(rightDue) - Number(leftDue);
    return left.dueAt - right.dueAt;
  });
}

/** How many are waiting on the reader right now. */
export function dueCount(reminders: Reminder[], nowSeconds: number): number {
  return reminders.filter((reminder) => isDue(reminder, nowSeconds)).length;
}
