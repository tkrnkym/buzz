import { type FormEvent, useCallback, useRef, useState } from "react";
import { Paperclip, Smile, X } from "lucide-react";

import { useMyPubkey, useSendMessage } from "@/features/chat/use-chat";
import { formatBytes } from "@/features/chat/upload";
import { useUpload } from "@/features/chat/use-upload";
import { useDirectory } from "@/features/directory/use-directory";
import { UserPicker } from "@/features/directory/ui/UserPicker";
import {
  activeEmojiQuery,
  applyEmoji,
  emojiTagsForContent,
} from "@/features/emoji/emoji-model";
import { EmojiPicker } from "@/features/emoji/ui/EmojiPicker";
import { useEmojiCatalog } from "@/features/emoji/use-emoji";
import {
  activeMentionQuery,
  applyMention,
  mentionRecipients,
  mentionTags,
  survivingMentions,
} from "@/features/messages/lib/mentions";
import { useProfiles } from "@/features/profile/profile-store";
import { useUserLabels } from "@/features/profile/use-user-label";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export interface ReplyTarget {
  rootId: string;
  parentId: string;
  authorPubkey: string;
  preview: string;
}

/** Stable empty list, so the label hook is not re-run on every render. */
const EMPTY_PUBKEYS: string[] = [];

export function MessageComposer({
  channelId,
  channelName,
  channelParticipants,
  isDm = false,
  replyTo,
  onCancelReply,
  onComposing,
  onSent,
}: {
  channelId: string;
  channelName: string;
  /** A DM's participants, who are addressed whether or not the text names them. */
  channelParticipants?: string[];
  /** A DM is addressed by a person's name, not by a hashed channel name. */
  isDm?: boolean;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const myPubkey = useMyPubkey();
  const directory = useDirectory();
  const directoryProfiles = useProfiles([]);
  const emojiCatalog = useEmojiCatalog();
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** The `:name` token being typed, which completes without opening the grid. */
  const [emojiQuery, setEmojiQuery] = useState<{
    query: string;
    from: number;
  } | null>(null);
  /**
   * Mentions inserted through the picker, with the label each one wrote.
   *
   * Kept here rather than derived from the text on send: two people can share a
   * display name, so parsing `@Name` back to a pubkey is ambiguous. What the
   * author *chose* is unambiguous, and `survivingMentions` drops any whose text
   * they then deleted.
   */
  const insertedMentions = useRef<{ pubkey: string; label: string }[]>([]);
  const [mention, setMention] = useState<{
    query: string;
    from: number;
  } | null>(null);
  const pickerKeyHandler = useRef<((event: KeyboardEvent) => boolean) | null>(
    null,
  );

  const syncQueries = useCallback((value: string, caret: number) => {
    const mentionAt = activeMentionQuery(value, caret);
    setMention(mentionAt);
    // A mention wins: `@` and `:` cannot both be the token under the caret, and
    // showing two floating lists at once would be a guess about which.
    setEmojiQuery(mentionAt ? null : activeEmojiQuery(value, caret));
  }, []);

  /** Insert text at the caret, or replace the `:name` token if one is open. */
  const insertEmoji = useCallback(
    (text: string) => {
      const input = inputRef.current;
      const caret = input?.selectionStart ?? draft.length;
      const next = emojiQuery
        ? applyEmoji(draft, emojiQuery.from, caret, text.replace(/:/g, ""))
        : {
            text: `${draft.slice(0, caret)}${text}${draft.slice(caret)}`,
            caret: caret + text.length,
          };
      setDraft(next.text);
      setEmojiQuery(null);
      setEmojiOpen(false);
      requestAnimationFrame(() => {
        input?.focus();
        input?.setSelectionRange(next.caret, next.caret);
      });
    },
    [draft, emojiQuery],
  );

  const pickMention = useCallback(
    (entry: { pubkey: string; label: string }) => {
      const input = inputRef.current;
      if (!mention || !input) return;
      const caret = input.selectionStart ?? draft.length;
      const next = applyMention(draft, mention.from, caret, entry.label);
      insertedMentions.current = [
        ...insertedMentions.current,
        { pubkey: entry.pubkey, label: entry.label },
      ];
      setDraft(next.text);
      setMention(null);
      setEmojiQuery(null);
      // Restore the caret after React has written the new value, or the browser
      // puts it at the end and the author types into the wrong place.
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(next.caret, next.caret);
      });
    },
    [draft, mention],
  );
  // The person being replied to. `labelOf`, so replying to yourself reads
  // "Reply to You" rather than repeating your own name back at you.
  const { labelOf } = useUserLabels(
    replyTo ? [replyTo.authorPubkey] : EMPTY_PUBKEYS,
  );
  const replyToLabel = replyTo ? labelOf(replyTo.authorPubkey) : "";

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
    const recipients = mentionRecipients({
      channelParticipants,
      explicitMentions: survivingMentions(content, insertedMentions.current),
      isDm,
      senderPubkey: myPubkey,
    });

    // Clear only after the relay accepts: a rejected send must not lose the
    // author's text or make them upload again.
    sendMessage.mutate(
      {
        content,
        attachments: [
          ...upload.attachments.map((attachment) => attachment.imeta),
          ...mentionTags(recipients),
          // NIP-30 requires the definition to travel with the event: a reader
          // whose client has never seen the author's set still has to render it.
          ...emojiTagsForContent(content, emojiCatalog),
        ],
        ...(replyTo
          ? { thread: { rootId: replyTo.rootId, parentId: replyTo.parentId } }
          : {}),
      },
      {
        onSuccess: (event) => {
          setDraft("");
          upload.clear();
          insertedMentions.current = [];
          setMention(null);
          setEmojiQuery(null);
          onSent({
            pubkey: event.pubkey,
            threadHeadId: replyTo?.parentId ?? null,
          });
          // The reply target deliberately survives the send. It is bound to the
          // open thread panel now, so clearing it here would drop the reader out
          // of the thread they are in the middle of — and their next message
          // would land in the channel instead. Closing the panel is what ends
          // the reply.
        },
      },
    );
  };

  const label = replyTo
    ? `Reply to ${replyToLabel}`
    : // No hash for a DM: the label is a person's name, and "Message #Alice" reads
      // as a channel that does not exist.
      `Message ${isDm ? "" : "#"}${channelName}`;

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-1 border-t border-border px-4 py-3"
    >
      {replyTo && (
        <div className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1">
          <span className="min-w-0 flex-1 truncate text-2xs text-secondary-foreground">
            Replying to {replyToLabel}: {replyTo.preview}
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

      {mention && (
        <div className="relative">
          <UserPicker
            className="absolute bottom-1 left-0 w-72"
            emptyLabel="Nobody here matches that."
            entries={directory}
            onPick={pickMention}
            profiles={directoryProfiles}
            query={mention.query}
            registerKeyHandler={(handler) => {
              pickerKeyHandler.current = handler;
            }}
          />
        </div>
      )}

      {(emojiOpen || emojiQuery) && (
        <div className="relative">
          <EmojiPicker
            catalog={emojiCatalog}
            className="absolute bottom-1 left-0"
            onPick={(choice) => insertEmoji(choice.text)}
          />
        </div>
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Add an emoji"
          data-testid="open-emoji-picker"
          disabled={sendMessage.isPending}
          onClick={() => {
            setEmojiQuery(null);
            setEmojiOpen((open) => !open);
          }}
        >
          <Smile aria-hidden className="size-4" />
        </Button>
        <Input
          ref={inputRef}
          value={draft}
          onChange={(changeEvent) => {
            const value = changeEvent.target.value;
            setDraft(value);
            syncQueries(
              value,
              changeEvent.target.selectionStart ?? value.length,
            );
            if (value.trim()) {
              onComposing(
                replyTo
                  ? { rootId: replyTo.rootId, parentId: replyTo.parentId }
                  : undefined,
              );
            }
          }}
          onKeyDown={(keyEvent) => {
            // The picker moves its own highlight but never takes focus: pulling
            // focus off the field to arrow through a list would interrupt typing.
            if (mention && pickerKeyHandler.current?.(keyEvent.nativeEvent)) {
              keyEvent.preventDefault();
              return;
            }
            if (keyEvent.key === "Escape" && (mention || emojiQuery)) {
              keyEvent.preventDefault();
              setMention(null);
              setEmojiQuery(null);
            }
          }}
          // Clicking elsewhere in the text can move the caret out of the `@`
          // token, which should close the picker.
          onSelect={(selectEvent) => {
            const target = selectEvent.target as HTMLInputElement;
            syncQueries(target.value, target.selectionStart ?? 0);
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
