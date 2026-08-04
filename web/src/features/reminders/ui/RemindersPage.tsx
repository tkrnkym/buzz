import { Bell, Check, Clock, Hash, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import {
  dueCount,
  formatDueLabel,
  isDue,
  SNOOZE_OPTIONS,
  sortReminders,
} from "@/features/reminders/reminder-model";
import {
  removeReminder,
  setReminderDone,
  snoozeReminder,
} from "@/features/showcase/showcase-mutations";
import { NotWiredUp, ShowcasePage } from "@/features/showcase/ui/ShowcasePage";
import {
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
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
  const update = useShowcaseUpdate();
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
              {/* The marker is the control. A reminder is finished by ticking
                  it off, and a separate button beside an icon that already means
                  "done" would be two things saying one thing. */}
              <button
                aria-label={reminder.done ? "未完了に戻す" : "完了にする"}
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
                  reminder.done
                    ? "bg-secondary text-secondary-foreground"
                    : overdue
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  update && "hover:opacity-80",
                )}
                data-testid={`toggle-reminder-${reminder.id}`}
                disabled={update === null}
                onClick={() => {
                  update?.((current) =>
                    setReminderDone(current, reminder.id, !reminder.done),
                  );
                  if (!reminder.done) toast.success("完了にしました");
                }}
                type="button"
              >
                {reminder.done ? (
                  <Check aria-hidden className="size-3" />
                ) : (
                  <Bell aria-hidden className="size-3" />
                )}
              </button>

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
                        className="rounded-md border border-border px-2 py-0.5 text-badge text-muted-foreground hover:bg-accent disabled:opacity-60"
                        data-testid={`snooze-${option.minutes}-${reminder.id}`}
                        disabled={update === null}
                        key={option.label}
                        onClick={() => {
                          update?.((current) =>
                            snoozeReminder(
                              current,
                              reminder.id,
                              option.minutes * 60,
                              Math.floor(Date.now() / 1000),
                            ),
                          );
                          toast.success(`${option.label}に持ち越しました`);
                        }}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                    <button
                      aria-label="このリマインダーを消す"
                      className="rounded-md border border-border px-2 py-0.5 text-badge text-destructive hover:bg-destructive/10 disabled:opacity-60"
                      data-testid={`remove-reminder-${reminder.id}`}
                      disabled={update === null}
                      onClick={() => {
                        update?.((current) =>
                          removeReminder(current, reminder.id),
                        );
                        toast.success("消しました");
                      }}
                      type="button"
                    >
                      <Trash2 aria-hidden className="size-2.5" />
                    </button>
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
