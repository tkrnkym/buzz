import { AtSign, MessageSquareReply, Send } from "lucide-react";
import { useMemo } from "react";

import {
  CATEGORY_LABELS,
  isNotificationUnread,
  type NotificationCategory,
  truncateBody,
} from "@/features/notifications/notifications-model";
import { useNotifications } from "@/features/notifications/use-notifications";
import {
  resolveAvatarUrl,
  resolveUserLabel,
} from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { useShell } from "@/features/shell/shell-context";
import { cn } from "@/shared/lib/cn";
import { relativeTime } from "@/shared/lib/relative-time";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";
import { Skeleton } from "@/shared/ui/skeleton";

const CATEGORY_ICONS: Record<NotificationCategory, React.ReactNode> = {
  mention: <AtSign aria-hidden className="size-3" />,
  dm: <Send aria-hidden className="size-3" />,
  reply: <MessageSquareReply aria-hidden className="size-3" />,
};

/** How many rows are shown. The tail is history, and history is the timeline. */
const VISIBLE_LIMIT = 30;

/**
 * Messages addressed to this reader — mentions, DMs, and replies.
 *
 * A row selects rather than navigates. It used to link straight into the channel,
 * which meant reading one mention cost the reader the list they were working
 * through — the detail pane beside it is what the link became, and the way out to
 * the channel lives there, still anchored on the message rather than the room.
 *
 * Unread is derived from the channel cursor, so reading the room clears these
 * too. There is no dismiss button, deliberately: a second read state to keep in
 * step with the first is how the two end up disagreeing.
 */
export function NotificationList({
  onSelect,
  selectedId,
}: {
  onSelect: (id: string) => void;
  /** The row currently in the detail pane, or `null` when there is none. */
  selectedId: string | null;
}) {
  const { items, loaded, unreadCount } = useNotifications();
  const { channels, dms, readState } = useShell();

  const rows = useMemo(() => items.slice(0, VISIBLE_LIMIT), [items]);
  const authors = useMemo(() => rows.map((item) => item.authorPubkey), [rows]);
  const profiles = useProfiles(authors);
  const channelNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const channel of [...channels, ...dms])
      names.set(channel.id, channel.name);
    return names;
  }, [channels, dms]);

  const heading = (
    <h2 className="mb-2 flex items-center gap-2 text-2xs font-semibold text-muted-foreground">
      あなた宛
      {unreadCount > 0 && (
        <span
          className="rounded-full bg-primary/15 px-1.5 py-0.5 text-badge font-semibold text-primary"
          data-testid="notifications-unread-count"
        >
          {Math.min(unreadCount, 99)}
        </span>
      )}
    </h2>
  );

  if (!loaded) {
    return (
      <>
        {heading}
        <ul className="flex flex-col gap-1" data-testid="notifications-loading">
          {[70, 55, 62].map((width) => (
            <li className="flex items-center gap-3 px-2 py-2.5" key={width}>
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-4" style={{ width: `${width}%` }} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (rows.length === 0) {
    return (
      <>
        {heading}
        <p
          className="text-2xs text-muted-foreground"
          data-testid="notifications-empty"
        >
          あなた宛のメッセージはありません。メンション、DM、自分の投稿への返信がここに出ます。
        </p>
      </>
    );
  }

  return (
    <>
      {heading}
      <ul className="flex flex-col" data-testid="notification-rows">
        {rows.map((item) => {
          const label = resolveUserLabel({
            pubkey: item.authorPubkey,
            profiles,
            preferResolvedSelfLabel: true,
          });
          const unread = isNotificationUnread(item, readState.contexts);
          const channelName = item.channelId
            ? channelNames.get(item.channelId)
            : undefined;
          const body = truncateBody(item.content);

          const inner = (
            <>
              <PubkeyAvatar
                avatarUrl={resolveAvatarUrl(item.authorPubkey, profiles)}
                className="mt-0.5 shrink-0 rounded-full"
                label={label}
                pubkey={item.authorPubkey}
                size="sm"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-baseline gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-badge",
                      item.category === "dm"
                        ? "bg-primary/15 text-primary"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {CATEGORY_ICONS[item.category]}
                    {CATEGORY_LABELS[item.category]}
                  </span>
                  <span className="truncate text-sm font-medium">{label}</span>
                  {channelName && item.category !== "dm" && (
                    <span className="truncate text-badge text-muted-foreground">
                      #{channelName}
                    </span>
                  )}
                  <span className="text-badge text-muted-foreground">
                    {relativeTime(item.createdAt)}
                  </span>
                </span>
                <span className="truncate text-2xs text-muted-foreground">
                  {body}
                </span>
              </span>
              {unread && (
                <span className="mt-2 size-2 shrink-0 rounded-full bg-primary">
                  <span className="sr-only">未読</span>
                </span>
              )}
            </>
          );

          return (
            <li key={item.id}>
              <button
                aria-current={selectedId === item.id}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors",
                  selectedId === item.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
                data-testid={`notification-${item.id}`}
                onClick={() => onSelect(item.id)}
                type="button"
              >
                {inner}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
