import {
  Link2,
  MessageSquareReply,
  Pencil,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import type { CustomEmoji, EmojiCatalog } from "@/features/emoji/emoji-model";
import { EmojiPicker } from "@/features/emoji/ui/EmojiPicker";
import { cn } from "@/shared/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/**
 * Emoji offered for one-click reaction, without opening the picker.
 *
 * A fixed row rather than a frequency list: "most used" changes what is under
 * the cursor from one message to the next, which makes a one-click control into
 * something you have to read first.
 */
export const QUICK_REACTIONS = ["👍", "🎉", "✅", "👀", "❤️"];

const ACTION_CLASS =
  "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&>svg]:size-4";

function Action({
  disabled,
  label,
  onClick,
  children,
  testId,
  destructive = false,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className={cn(
            ACTION_CLASS,
            destructive && "hover:bg-destructive/10 hover:text-destructive",
          )}
          data-testid={testId}
          disabled={disabled}
          onClick={onClick}
          type="button"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The hover toolbar on a message row, ported from the desktop client.
 *
 * Anchored to the row's top-right and revealed on hover or keyboard focus, so
 * the timeline stays quiet while reading but every action is reachable without
 * a pointer. Edit and delete appear only for the reader's own messages — the
 * relay enforces that too, but offering a button that is going to be refused is
 * worse than not offering it.
 */
export function MessageActionBar({
  canManage,
  disabled,
  emojiCatalog,
  moderationMenu,
  onCopyLink,
  onDelete,
  onEdit,
  onReact,
  onReply,
  reactedEmojis,
}: {
  canManage: boolean;
  disabled?: boolean;
  /** The workspace palette, offered alongside the Unicode grid. */
  emojiCatalog: EmojiCatalog;
  /**
   * The report/mute/moderate menu, passed in rather than rendered here.
   *
   * A slot because that menu reads relay state — the reader's role, the
   * restricted list — and this bar is otherwise given everything it draws. Kept
   * that way so a row's toolbar stays cheap to render.
   */
  moderationMenu?: React.ReactNode;
  onCopyLink: () => void;
  onDelete: () => void;
  onEdit: () => void;
  /**
   * React with an emoji.
   *
   * A custom one arrives with its definition, because a kind:7 carrying
   * `:shortcode:` and no `emoji` tag is a reaction nobody else can render.
   */
  onReact: (emoji: string, definition?: CustomEmoji) => void;
  onReply: () => void;
  /** Emoji already on the message, which the quick row omits. */
  reactedEmojis: string[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const quick = QUICK_REACTIONS.filter(
    (emoji) => !reactedEmojis.includes(emoji),
  );

  return (
    <div
      className={cn(
        "absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 shadow-sm",
        "opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100",
        // Kept visible while the picker is open, so the bar does not fade out
        // from under an open panel. It no longer needs lifting above the next
        // row's bar: the picker is portalled now, not a child of this stacking
        // context.
        pickerOpen && "opacity-100",
      )}
      data-testid="message-action-bar"
    >
      {/* The first two quick reactions inline; the rest behind the picker, so
          the bar stays a fixed width regardless of what is already reacted. */}
      {quick.slice(0, 2).map((emoji) => (
        <button
          aria-label={`React with ${emoji}`}
          className={ACTION_CLASS}
          data-testid={`quick-react-${emoji}`}
          disabled={disabled}
          key={emoji}
          onClick={() => onReact(emoji)}
          type="button"
        >
          {emoji}
        </button>
      ))}

      <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
        {/* Tooltip outside, popover inside, both `asChild` onto the same button:
            each merges its own props, and reversing the order would have the
            popover trying to clone onto a context provider. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger
              aria-label="Add reaction"
              className={ACTION_CLASS}
              data-testid="open-reaction-picker"
              disabled={disabled}
              type="button"
            >
              <SmilePlus />
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Add reaction</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-64 p-2" side="top">
          <EmojiPicker
            catalog={emojiCatalog}
            onPick={(choice) => {
              onReact(choice.text, choice.emoji);
              setPickerOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <Action
        disabled={disabled}
        label="Reply in thread"
        onClick={onReply}
        testId="reply-in-thread"
      >
        <MessageSquareReply />
      </Action>

      <Action
        label="Copy link to message"
        onClick={onCopyLink}
        testId="copy-message-link"
      >
        <Link2 />
      </Action>

      {canManage && (
        <>
          <Action
            disabled={disabled}
            label="Edit message"
            onClick={onEdit}
            testId="edit-message"
          >
            <Pencil />
          </Action>
          <Action
            destructive
            disabled={disabled}
            label="Delete message"
            onClick={onDelete}
            testId="delete-message"
          >
            <Trash2 />
          </Action>
        </>
      )}

      {moderationMenu}
    </div>
  );
}
