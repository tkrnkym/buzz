import { type FormEvent, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";

import { useSendMessage } from "@/features/chat/use-chat";
import { formatBytes } from "@/features/chat/upload";
import { useUpload } from "@/features/chat/use-upload";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export interface ReplyTarget {
  rootId: string;
  parentId: string;
  authorPubkey: string;
  preview: string;
}

export function MessageComposer({
  channelId,
  channelName,
  replyTo,
  onCancelReply,
  onComposing,
  onSent,
}: {
  channelId: string;
  channelName: string;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  /** Called as the user types; throttling is the caller's business. */
  onComposing: (thread?: { rootId: string; parentId: string }) => void;
  /** Called once a message lands, so this author stops showing as typing. */
  onSent: (input: { pubkey: string; threadHeadId: string | null }) => void;
}) {
  const [draft, setDraft] = useState("");
  const sendMessage = useSendMessage(channelId);
  const upload = useUpload();
  const fileInput = useRef<HTMLInputElement>(null);

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    const markdown = await upload.attach(file);
    // The renderer keys `imeta` off the URL in the body, so an attachment that
    // never reaches the text is invisible however complete its tag is.
    if (markdown) {
      setDraft((current) => (current ? `${current}\n${markdown}` : markdown));
    }
  };

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    const content = draft.trim();
    // An attachment is a message on its own; requiring a caption would mean a
    // picture could not be posted without one.
    if (
      (!content && upload.attachments.length === 0) ||
      sendMessage.isPending
    ) {
      return;
    }
    // Clear only after the relay accepts: a rejected send must not lose the
    // author's text or make them upload again.
    sendMessage.mutate(
      {
        content,
        attachments: upload.attachments.map((attachment) => attachment.imeta),
        ...(replyTo
          ? { thread: { rootId: replyTo.rootId, parentId: replyTo.parentId } }
          : {}),
      },
      {
        onSuccess: (event) => {
          setDraft("");
          upload.clear();
          onSent({
            pubkey: event.pubkey,
            threadHeadId: replyTo?.parentId ?? null,
          });
          onCancelReply();
        },
      },
    );
  };

  const label = replyTo
    ? `Reply to ${truncatePubkey(replyTo.authorPubkey)}`
    : `Message #${channelName}`;

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-1 border-t border-border px-4 py-3"
    >
      {replyTo && (
        <div className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1">
          <span className="min-w-0 flex-1 truncate text-2xs text-secondary-foreground">
            Replying to {truncatePubkey(replyTo.authorPubkey)}:{" "}
            {replyTo.preview}
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      )}

      {upload.attachments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {upload.attachments.map((attachment) => (
            <li
              key={attachment.descriptor.sha256}
              className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1"
            >
              <span className="max-w-40 truncate text-2xs text-secondary-foreground">
                {attachment.filename}
              </span>
              <span className="text-2xs text-muted-foreground">
                {formatBytes(attachment.descriptor.size)}
              </span>
              <button
                type="button"
                onClick={() => upload.remove(attachment.descriptor.sha256)}
                aria-label={`Remove ${attachment.filename}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          aria-label="Attach a file"
          onChange={(changeEvent) => {
            void onPickFile(changeEvent.target.files?.[0]);
            // Reset so picking the same file again still fires a change.
            changeEvent.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Attach a file"
          disabled={upload.isUploading || sendMessage.isPending}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip aria-hidden className="size-4" />
        </Button>
        <Input
          value={draft}
          onChange={(changeEvent) => {
            setDraft(changeEvent.target.value);
            if (changeEvent.target.value.trim()) {
              onComposing(
                replyTo
                  ? { rootId: replyTo.rootId, parentId: replyTo.parentId }
                  : undefined,
              );
            }
          }}
          placeholder={label}
          aria-label={label}
          autoComplete="off"
          disabled={sendMessage.isPending}
        />
        <Button
          type="submit"
          disabled={
            (!draft.trim() && upload.attachments.length === 0) ||
            sendMessage.isPending
          }
        >
          {sendMessage.isPending ? "Sending…" : "Send"}
        </Button>
      </div>

      {upload.isUploading && (
        <p className="text-2xs text-muted-foreground">Uploading…</p>
      )}

      {upload.error && (
        <p className="text-2xs text-destructive">
          {upload.error}{" "}
          <button
            type="button"
            onClick={upload.dismissError}
            className="underline"
          >
            Dismiss
          </button>
        </p>
      )}

      {sendMessage.error && (
        <p className="text-2xs text-destructive">
          {sendMessage.error instanceof Error
            ? sendMessage.error.message
            : "Send failed"}
        </p>
      )}
    </form>
  );
}
