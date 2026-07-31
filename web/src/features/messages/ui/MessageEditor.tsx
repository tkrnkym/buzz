import { useEffect, useRef, useState } from "react";

/**
 * Inline editor, shown in place of a message body.
 *
 * Enter submits and Escape cancels, because that is what a reader who opened an
 * edit expects and reaching for a mouse to commit a one-word fix is the whole
 * cost of the feature. Shift+Enter still inserts a newline, so a multi-line
 * message can be edited without losing its shape.
 */
export function MessageEditor({
  initialContent,
  onCancel,
  onSubmit,
  pending,
}: {
  initialContent: string;
  onCancel: () => void;
  onSubmit: (content: string) => void;
  pending?: boolean;
}) {
  const [draft, setDraft] = useState(initialContent);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus();
    // Caret at the end, not selecting everything: the common edit is a fix at
    // the end, and a select-all means one keystroke wipes the message.
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  const submit = () => {
    const trimmed = draft.trim();
    // An empty edit is refused rather than treated as a delete — see
    // `useEditMessage`. Cancelling is the way out.
    if (!trimmed) {
      onCancel();
      return;
    }
    if (trimmed === initialContent.trim()) {
      // Nothing changed, so publish nothing. An unchanged edit would still
      // stamp the message "(edited)" for everyone.
      onCancel();
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div className="mt-1 flex flex-col gap-1">
      <textarea
        aria-label="Edit message"
        className="min-h-16 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        data-testid="message-editor"
        disabled={pending}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        ref={ref}
        value={draft}
      />
      <div className="flex items-center gap-2">
        <button
          className="rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          data-testid="save-edit"
          disabled={pending}
          onClick={submit}
          type="button"
        >
          Save
        </button>
        <button
          className="rounded-md px-2 py-1 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <span className="text-2xs text-muted-foreground">
          Enter to save · Escape to cancel
        </span>
      </div>
    </div>
  );
}
