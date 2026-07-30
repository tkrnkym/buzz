import { type FormEvent, useState } from "react";

import { useSendMessage } from "@/features/chat/use-chat";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export function MessageComposer({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
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
    sendMessage.mutate(content, {
      onSuccess: () => setDraft(""),
    });
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-1 border-t border-border px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(changeEvent) => setDraft(changeEvent.target.value)}
          placeholder={`Message #${channelName}`}
          aria-label={`Message #${channelName}`}
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
