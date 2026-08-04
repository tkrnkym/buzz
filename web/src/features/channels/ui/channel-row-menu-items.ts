import {
  Bell,
  BellOff,
  Link2,
  LogOut,
  Star,
  StarOff,
  type LucideIcon,
} from "lucide-react";

/**
 * What a channel row offers, as data.
 *
 * The row has two ways in — the `⋯` button and a right-click — and they have to
 * offer the same things in the same order. Written once here rather than twice in
 * JSX, because two hand-maintained copies of a menu drift: the desktop client's
 * row menu and its context menu disagreed about whether "Copy link" was above or
 * below the separator.
 *
 * Pure, so the labels and the ordering are testable without rendering either menu.
 */
export type ChannelRowItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Rendered in the destructive colour, and placed after a separator. */
  destructive?: boolean;
};

export function channelRowMenuItems({
  isMuted,
  isStarred,
  onCopyLink,
  onLeave,
  onToggleMute,
  onToggleStar,
}: {
  isMuted: boolean;
  isStarred: boolean;
  onCopyLink: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleStar: () => void;
}): ChannelRowItem[] {
  return [
    {
      key: "toggle-star",
      label: isStarred ? "Remove star" : "Star channel",
      icon: isStarred ? StarOff : Star,
      onSelect: onToggleStar,
    },
    {
      key: "toggle-mute",
      label: isMuted ? "Unmute" : "Mute channel",
      icon: isMuted ? Bell : BellOff,
      onSelect: onToggleMute,
    },
    {
      key: "copy-link",
      label: "Copy link",
      icon: Link2,
      onSelect: onCopyLink,
    },
    // Last and separated, so it is not adjacent to the one a reader reaches for
    // most.
    {
      key: "leave-channel",
      label: "Leave channel",
      icon: LogOut,
      onSelect: onLeave,
      destructive: true,
    },
  ];
}
