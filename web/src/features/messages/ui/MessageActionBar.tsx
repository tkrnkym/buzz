import {
  Link2,
  MessageSquareReply,
  Pencil,
  SmilePlus,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/lib/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/**
 * Emoji offered for one-click reaction.
 *
 * A fixed set rather than a full picker: a picker needs the custom-emoji module
 * (NIP-30 packs), and any emoji already on a message can still be toggled from
 * its pill.
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
  onCopyLink,
  onDelete,
  onEdit,
  onReact,
  onReply,
  reactedEmojis,
}: {
  canManage: boolean;
  disabled?: boolean;
  onCopyLink: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onReact: (emoji: string) => void;
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

      <div className="relative">
        <Action
          disabled={disabled}
          label="Add reaction"
          onClick={() => setPickerOpen((open) => !open)}
          testId="open-reaction-picker"
        >
          <SmilePlus />
        </Action>
        {pickerOpen && (
          <div
            className="absolute right-0 top-full z-20 mt-1 flex gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md"
            data-testid="reaction-picker"
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                aria-label={`React with ${emoji}`}
                className={ACTION_CLASS}
                disabled={disabled}
                key={emoji}
                onClick={() => {
                  onReact(emoji);
                  setPickerOpen(false);
                }}
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}
