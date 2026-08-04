import { Link } from "@tanstack/react-router";
import { ArrowRight, Hash, Inbox, Lock, FileText } from "lucide-react";
import { useMemo } from "react";

import type { Channel } from "@/features/chat/chat-model";
import { MessageContent } from "@/features/chat/ui/MessageContent";
import { useChannelMessages } from "@/features/chat/use-chat";
import {
  neighbourhood,
  type InboxSelection,
} from "@/features/home/inbox-selection";
import {
  CATEGORY_LABELS,
  type NotificationItem,
} from "@/features/notifications/notifications-model";
import {
  resolveAvatarUrl,
  resolveUserLabel,
} from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { cn } from "@/shared/lib/cn";
import { relativeTime } from "@/shared/lib/relative-time";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

/** How many messages either side of the selected one are shown as context. */
const CONTEXT_RADIUS = 3;

function ChannelIcon({ channel }: { channel: Channel }) {
  if (channel.isPrivate) return <Lock aria-hidden className="size-4" />;
  if (channel.type === "forum")
    return <FileText aria-hidden className="size-4" />;
  return <Hash aria-hidden className="size-4" />;
}

/** The link out. Anchored on the message when there is one — see `?m=`. */
function OpenInChannel({
  channelId,
  label,
  messageId,
}: {
  channelId: string;
  label: string;
  messageId?: string;
}) {
  return (
    <Link
      className="inline-flex items-center gap-1.5 self-start rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium transition-colors hover:bg-accent"
      data-testid="inbox-open-in-channel"
      params={{ channelId }}
      search={messageId === undefined ? {} : { m: messageId }}
      to="/c/$channelId"
    >
      {label}
      <ArrowRight aria-hidden className="size-3" />
    </Link>
  );
}

/**
 * A notification, in its conversation.
 *
 * The context window is the reason this pane exists rather than a wider row: a
 * mention on its own is often unreadable — "それでいいと思います" answers a
 * question one row above it — and following the link to find out used to cost the
 * reader their place in the list.
 */
function NotificationDetail({
  channel,
  item,
}: {
  channel: Channel | null;
  item: NotificationItem;
}) {
  // Called unconditionally with whatever channel the item names, because a hook
  // cannot be skipped for the items that have none.
  const timeline = useChannelMessages(item.channelId);
  const context = useMemo(
    () =>
      neighbourhood(
        timeline.rows,
        (row) => row.message.id,
        item.id,
        CONTEXT_RADIUS,
      ),
    [timeline.rows, item.id],
  );
  const authors = useMemo(
    () => [item.authorPubkey, ...context.map((row) => row.message.pubkey)],
    [item.authorPubkey, context],
  );
  const profiles = useProfiles(authors);

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="inbox-detail-notification"
    >
      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
          <span className="rounded bg-secondary px-1.5 py-0.5 text-badge font-medium text-secondary-foreground">
            {CATEGORY_LABELS[item.category]}
          </span>
          {channel && <span>#{channel.name}</span>}
          <span>{relativeTime(item.createdAt)}</span>
        </p>
        {item.channelId && (
          <OpenInChannel
            channelId={item.channelId}
            label={channel ? `#${channel.name} を開く` : "チャンネルで開く"}
            messageId={item.id}
          />
        )}
      </div>

      {context.length > 0 ? (
        <ul className="flex flex-col gap-3" data-testid="inbox-detail-context">
          {context.map((row) => {
            const label = resolveUserLabel({
              pubkey: row.message.pubkey,
              profiles,
              preferResolvedSelfLabel: true,
            });
            const isSubject = row.message.id === item.id;
            return (
              <li
                className={cn(
                  "flex gap-2.5 rounded-md p-2",
                  // The one that named the reader is the one they came for, so it
                  // is marked rather than left to be found among its neighbours.
                  isSubject && "bg-primary/5 ring-1 ring-primary/30",
                )}
                data-testid={isSubject ? "inbox-detail-subject" : undefined}
                key={row.message.id}
              >
                <PubkeyAvatar
                  avatarUrl={resolveAvatarUrl(row.message.pubkey, profiles)}
                  label={label}
                  pubkey={row.message.pubkey}
                  shape="circle"
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2">
                    <span className="truncate text-2xs font-medium">
                      {label}
                    </span>
                    <span className="text-badge text-muted-foreground">
                      {relativeTime(row.message.createdAt)}
                    </span>
                  </p>
                  <div className="text-base">
                    <MessageContent content={row.content} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        // Nothing around it: either the history is still arriving, or the message
        // is older than the loaded window. Showing the message on its own is
        // honest; showing the top of the room as if it were context is not.
        <div
          className="flex flex-col gap-2 rounded-md border border-border p-3"
          data-testid="inbox-detail-subject"
        >
          <p className="text-2xs font-medium">
            {resolveUserLabel({
              pubkey: item.authorPubkey,
              profiles,
              preferResolvedSelfLabel: true,
            })}
          </p>
          <div className="text-base">
            <MessageContent content={item.content} />
          </div>
          <p className="text-badge text-muted-foreground">
            {timeline.loaded
              ? "この前後のやり取りは読み込み済みの範囲より前にあります。"
              : "前後のやり取りを読み込んでいます…"}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A room that moved.
 *
 * Deliberately thinner than the notification pane. The Inbox's room rows come
 * from the relay's per-channel activity snapshots, which say a channel moved and
 * nothing about who said what — so there is no message to preview here, and
 * inventing one would be the lie `inbox.ts` was written to avoid.
 */
function RoomDetail({
  channel,
  lastActivityAt,
}: {
  channel: Channel;
  lastActivityAt: number | null;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="inbox-detail-room">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">
          <ChannelIcon channel={channel} />
        </span>
        <h2 className="truncate text-sm font-semibold">{channel.name}</h2>
      </div>
      {(channel.topic ?? channel.about) && (
        <p className="text-2xs text-muted-foreground">
          {channel.topic ?? channel.about}
        </p>
      )}
      <p className="text-2xs text-muted-foreground">
        {lastActivityAt === null
          ? "未読の動きがありますが、最後の時刻はまだ届いていません。"
          : `最後の動きは ${relativeTime(lastActivityAt)}。`}
      </p>
      <p className="text-badge text-muted-foreground">
        部屋の行は「動いた」ことしか伝えません。誰が何を言ったかは開いて確かめてください。
      </p>
      <OpenInChannel channelId={channel.id} label={`#${channel.name} を開く`} />
    </div>
  );
}

/**
 * The right half of the Inbox.
 *
 * Which selection it is showing is decided in `inbox-selection.ts`, and it is
 * derived on every render rather than corrected afterwards — the list is live, so
 * a stored selection can name a row that has already dropped off it.
 */
export function InboxDetail({
  channels,
  item,
  lastActivityAt,
  selection,
}: {
  channels: Channel[];
  /** The selected notification, when the selection is one. */
  item: NotificationItem | null;
  lastActivityAt: number | null;
  selection: InboxSelection | null;
}) {
  const channelId =
    selection?.kind === "room"
      ? selection.channelId
      : (item?.channelId ?? null);
  const channel =
    channels.find((candidate) => candidate.id === channelId) ?? null;

  if (selection === null) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center"
        data-testid="inbox-detail-empty"
      >
        <Inbox aria-hidden className="size-8 text-muted-foreground" />
        <p className="text-2xs text-muted-foreground">
          選ぶものがありません。あなた宛のメッセージと動きのあった部屋がここに出ます。
        </p>
      </div>
    );
  }

  if (selection.kind === "room") {
    return channel === null ? null : (
      <RoomDetail channel={channel} lastActivityAt={lastActivityAt} />
    );
  }

  return item === null ? null : (
    <NotificationDetail channel={channel} item={item} />
  );
}
