import { type FormEvent, useState } from "react";
import { X } from "lucide-react";

import { useSendMessage } from "@/features/chat/use-chat";
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
}: {
  channelId: string;
  channelName: string;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
}) {
  const [draft, setDraft] = useState("");
  const sendMessage = useSendMessage(channelId);

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    const content = draft.trim();
    if (!content || sendMessage.isPending) {
      return;
    }
    // Clear only after the relay accepts: a rejected send must not lose the
    // author's text.
    sendMessage.mutate(
      {
        content,
        ...(replyTo
          ? { thread: { rootId: replyTo.rootId, parentId: replyTo.parentId } }
          : {}),
      },
      {
        onSuccess: () => {
          setDraft("");
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

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(changeEvent) => setDraft(changeEvent.target.value)}
          placeholder={label}
          aria-label={label}
          autoComplete="off"
          disabled={sendMessage.isPending}
        />
        <Button type="submit" disabled={!draft.trim() || sendMessage.isPending}>
          {sendMessage.isPending ? "Sending…" : "Send"}
        </Button>
      </div>

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
