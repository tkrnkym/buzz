import { Check, FileText, Pencil, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  applyEdit,
  isEmpty,
  isStaleWrite,
  type Canvas,
} from "@/features/canvas/canvas-model";
import { resolveUserLabel } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { Markdown } from "@/shared/ui/markdown/Markdown";

/**
 * The channel's canvas, beside its timeline.
 *
 * A stream is good at what is happening and bad at what is true. This is the
 * other half: the current state of the thing the room is about, edited in place
 * rather than restated every few days.
 *
 * It reads as a document and edits as plain text. A rich editor here would be a
 * second composer with a second set of quirks; the timeline already has the
 * one worth having, and a canvas is read far more often than it is written.
 *
 * A save from an older revision is refused rather than merged. Last-write-wins
 * on a shared document loses the slower typist's work without telling them,
 * and this client has no operational transform to do better — so it says so.
 */
export function CanvasPanel({
  canvas,
  channelName,
  nowSeconds,
  onClose,
  onSave,
  selfPubkey,
}: {
  canvas: Canvas | null;
  channelName: string;
  nowSeconds: number;
  onClose: () => void;
  /** Absent where there is nothing to write to; the panel then reads only. */
  onSave?: (next: Canvas) => void;
  selfPubkey: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  /** The revision the current edit started from, for the staleness check. */
  const [startedFrom, setStartedFrom] = useState(0);

  const profiles = useProfiles(canvas ? [canvas.updatedByPubkey] : []);
  const editor = canvas
    ? resolveUserLabel({
        pubkey: canvas.updatedByPubkey,
        profiles,
        preferResolvedSelfLabel: true,
      })
    : null;

  const beginEdit = () => {
    setDraft(canvas?.body ?? "");
    setStartedFrom(canvas?.revision ?? 0);
    setEditing(true);
  };

  const save = () => {
    if (!canvas || !onSave) return;
    if (isStaleWrite(startedFrom, canvas.revision)) {
      // Refused, not merged. The reader still has their text in the box.
      toast.error(
        "このあいだに他の人が更新しました。書いたものは残っているので、内容を確かめてから保存し直してください。",
      );
      return;
    }
    onSave(applyEdit(canvas, draft, selfPubkey ?? "", nowSeconds));
    setEditing(false);
    toast.success("キャンバスを保存しました");
  };

  return (
    <aside
      aria-label={`#${channelName} のキャンバス`}
      className="flex w-96 shrink-0 flex-col bg-background shadow-panel-left"
      data-testid="canvas-panel"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <FileText aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate text-2xs font-semibold">キャンバス</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {onSave &&
            (editing ? (
              <>
                <button
                  aria-label="保存する"
                  className="flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent"
                  data-testid="save-canvas"
                  onClick={save}
                  type="button"
                >
                  <Check aria-hidden className="size-3.5" />
                </button>
                <button
                  aria-label="編集をやめる"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  data-testid="cancel-canvas-edit"
                  onClick={() => setEditing(false)}
                  type="button"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </>
            ) : (
              <button
                aria-label="キャンバスを編集"
                className="flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent"
                data-testid="edit-canvas"
                onClick={beginEdit}
                type="button"
              >
                <Pencil aria-hidden className="size-3" />
              </button>
            ))}
          <button
            aria-label="キャンバスを閉じる"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            data-testid="close-canvas"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {editing ? (
          <textarea
            aria-label="キャンバスの内容"
            className="h-full min-h-64 w-full resize-none rounded-md border border-border bg-background p-2.5 font-mono text-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid="canvas-editor"
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
        ) : isEmpty(canvas) ? (
          <p
            className="text-2xs text-muted-foreground"
            data-testid="canvas-empty"
          >
            この部屋のキャンバスはまだ空です。
            {onSave
              ? "いま分かっていることを書いておくと、あとから来た人が流れを遡らずに済みます。"
              : "編集できる状態ではありません。"}
          </p>
        ) : (
          <div data-testid="canvas-body">
            <Markdown content={canvas?.body ?? ""} />
          </div>
        )}
      </div>

      {canvas && !editing && !isEmpty(canvas) && (
        <footer
          className="shrink-0 border-t border-border px-3 py-2 text-badge text-muted-foreground"
          data-testid="canvas-meta"
        >
          {/* Last editor, not author: a canvas belongs to the room. */}
          {editor} が {formatRelativeTime(canvas.updatedAt, nowSeconds)}に更新 ·
          第{canvas.revision}版
        </footer>
      )}
    </aside>
  );
}
