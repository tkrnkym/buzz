import { Bell, Check, Clock, Hash } from "lucide-react";
import { useMemo } from "react";

import {
  dueCount,
  formatDueLabel,
  isDue,
  SNOOZE_OPTIONS,
  sortReminders,
} from "@/features/reminders/reminder-model";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import { useShowcase } from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";

/**
 * Reminders: messages someone chose to come back to.
 *
 * Snooze sits on the row rather than behind a menu. The whole point of a
 * reminder is that it arrives at a bad moment, so pushing it out has to be one
 * click — the desktop client learned this and put the durations inline.
 */
export function RemindersPage() {
  const showcase = useShowcase();
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);
  const reminders = useMemo(
    () => sortReminders(showcase?.reminders ?? [], nowSeconds),
    [showcase, nowSeconds],
  );

  if (!showcase) {
    return (
      <ShowcasePage subtitle="あとで戻ってくると決めたもの" title="Reminders">
        <NotWiredUp what="リマインダー" />
      </ShowcasePage>
    );
  }

  const due = dueCount(reminders, nowSeconds);

  return (
    <ShowcasePage
      subtitle={
        due > 0 ? `${due} 件が来ています` : "あとで戻ってくると決めたもの"
      }
      title="Reminders"
    >
      <ul className="flex flex-col gap-2" data-testid="reminder-list">
        {reminders.map((reminder) => {
          const overdue = isDue(reminder, nowSeconds);
          return (
            <li
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                overdue ? "border-primary/40 bg-primary/5" : "border-border",
                reminder.done && "opacity-60",
              )}
              data-testid={`reminder-${reminder.id}`}
              key={reminder.id}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                  reminder.done
                    ? "bg-secondary text-secondary-foreground"
                    : overdue
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                )}
              >
                {reminder.done ? (
                  <Check aria-hidden className="size-3" />
                ) : (
                  <Bell aria-hidden className="size-3" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm",
                    reminder.done && "line-through decoration-muted-foreground",
                  )}
                >
                  {reminder.subject}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-badge text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5">
                    <Hash aria-hidden className="size-2.5" />
                    {reminder.channel}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Clock aria-hidden className="size-2.5" />
                    {formatDueLabel(reminder.dueAt, nowSeconds)}
                  </span>
                </p>

                {!reminder.done && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {SNOOZE_OPTIONS.map((option) => (
                      <button
                        className="rounded-md border border-border px-2 py-0.5 text-badge text-muted-foreground disabled:opacity-60"
                        disabled
                        key={option.label}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </ShowcasePage>
  );
}
