import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  REPORT_CATEGORIES,
  type ReportType,
} from "@/features/moderation/moderation-model";
import { useSubmitReport } from "@/features/moderation/use-moderation";
import { cn } from "@/shared/lib/cn";
import { Dialog } from "@/shared/ui/dialog";

/**
 * Report a message to the community's moderators.
 *
 * A category is required and the note is not: the category is what the relay
 * triages on, and a report that arrives as prose alone has to be read by a human
 * before it can even be sorted.
 *
 * The reporter is told the report was sent, not what will happen to it. Nothing
 * else would be true — a moderator decides, and this client cannot promise an
 * outcome on their behalf.
 */
export function ReportMessageDialog({
  authorPubkey,
  eventId,
  onClose,
  open,
}: {
  authorPubkey: string;
  eventId: string;
  onClose: () => void;
  open: boolean;
}) {
  const submitReport = useSubmitReport();
  const [category, setCategory] = useState<ReportType | null>(null);
  const [note, setNote] = useState("");

  // Reset on open so a previous report's selection never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setCategory(null);
    setNote("");
  }, [open]);

  const submit = () => {
    if (!category) return;
    submitReport.mutate(
      { authorPubkey, eventId, reportType: category, note },
      {
        onSuccess: () => {
          toast.success("通報を送信しました");
          onClose();
        },
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : "通報を送信できませんでした",
          ),
      },
    );
  };

  return (
    <Dialog
      description="このメッセージをコミュニティのモデレーターに知らせます。相手には通知されません。"
      footer={
        <>
          <button
            className="rounded-md px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            キャンセル
          </button>
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-foreground disabled:opacity-60"
            data-testid="submit-report"
            disabled={!category || submitReport.isPending}
            onClick={submit}
            type="button"
          >
            {submitReport.isPending ? "送信中…" : "通報する"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      testId="report-message-dialog"
      title="メッセージを通報"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-2xs font-medium text-muted-foreground">
          理由
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {REPORT_CATEGORIES.map((option) => (
            <button
              aria-pressed={category === option.value}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-2xs transition-colors",
                category === option.value
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-border hover:bg-accent",
              )}
              data-testid={`report-category-${option.value}`}
              key={option.value}
              onClick={() => setCategory(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-2xs font-medium text-muted-foreground">
          補足（任意）
        </span>
        <textarea
          className="min-h-20 w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="report-note"
          onChange={(event) => setNote(event.target.value)}
          placeholder="モデレーターが判断するのに役立つことがあれば"
          value={note}
        />
      </label>
    </Dialog>
  );
}
