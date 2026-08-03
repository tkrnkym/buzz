import { useMutation } from "@tanstack/react-query";
import { MessageSquareHeart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  buildFeedbackTemplate,
  canSendFeedback,
  FEEDBACK_BODY_MAX_BYTES,
  FEEDBACK_CATEGORIES,
  feedbackBodyBytes,
  type FeedbackCategory,
} from "@/features/feedback/feedback-model";
import { useRelaySession } from "@/shared/api/relay-provider";
import { cn } from "@/shared/lib/cn";
import { Dialog } from "@/shared/ui/dialog";

/**
 * Send feedback to whoever runs this relay.
 *
 * A real publish, unlike most of what sits near it in Settings — kind 42000 is
 * accepted at ingest. Worth telling the reader what that means, and the panel
 * does: it goes to the operators, not to the community, and nobody will see it in
 * a channel.
 *
 * The category is optional because the relay accepts feedback without one. The
 * body is not: an empty body is refused at ingest, so the send button stays
 * disabled rather than producing a rejection the reader has to decode.
 */
export function SendFeedbackDialog({
  onClose,
  open,
}: {
  onClose: () => void;
  open: boolean;
}) {
  const session = useRelaySession();
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [body, setBody] = useState("");

  const send = useMutation({
    mutationFn: () =>
      session.publish(
        buildFeedbackTemplate({
          body,
          ...(category ? { category } : {}),
        }),
      ),
  });

  const bytes = feedbackBodyBytes(body);
  const overBudget = bytes > FEEDBACK_BODY_MAX_BYTES;

  if (!open) return null;

  return (
    <Dialog
      description="このリレーを運用している人に届きます。チャンネルには流れないので、誰かの目に触れることはありません。"
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
            data-testid="submit-feedback"
            disabled={!canSendFeedback(body) || send.isPending}
            onClick={() =>
              send.mutate(undefined, {
                onSuccess: () => {
                  toast.success("送信しました。ありがとうございます");
                  setBody("");
                  setCategory(null);
                  onClose();
                },
                onError: (error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "送信できませんでした",
                  ),
              })
            }
            type="button"
          >
            {send.isPending ? "送信中…" : "送信する"}
          </button>
        </>
      }
      onClose={onClose}
      open
      testId="feedback-dialog"
      title="フィードバックを送る"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-2xs font-medium text-muted-foreground">
          種類（任意）
        </legend>
        <div className="flex flex-col gap-1.5">
          {FEEDBACK_CATEGORIES.map((option) => (
            <button
              aria-pressed={category === option.value}
              className={cn(
                "flex flex-col items-start rounded-md border px-2.5 py-2 text-left transition-colors",
                category === option.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-accent",
              )}
              data-testid={`feedback-category-${option.value}`}
              key={option.value}
              // Re-clicking clears it, because the relay accepts feedback with no
              // category and there would otherwise be no way back to that.
              onClick={() =>
                setCategory(category === option.value ? null : option.value)
              }
              type="button"
            >
              <span className="text-2xs font-medium">{option.label}</span>
              <span className="text-badge text-muted-foreground">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 flex flex-col gap-1">
        <span className="flex items-center justify-between">
          <span className="text-2xs font-medium text-muted-foreground">
            内容
          </span>
          {overBudget && (
            <span className="text-badge text-destructive">
              長すぎます（{bytes.toLocaleString()} /{" "}
              {FEEDBACK_BODY_MAX_BYTES.toLocaleString()} バイト）
            </span>
          )}
        </span>
        <textarea
          className="min-h-28 w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="feedback-body"
          onChange={(event) => setBody(event.target.value)}
          placeholder="気づいたこと、困ったこと、うまくいったこと"
          value={body}
        />
      </label>

      <p className="mt-2 flex items-center gap-1.5 text-badge text-muted-foreground">
        <MessageSquareHeart aria-hidden className="size-3" />
        あなたの公開鍵とともに記録されます。匿名では送れません。
      </p>
    </Dialog>
  );
}
