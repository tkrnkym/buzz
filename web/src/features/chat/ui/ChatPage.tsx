import { Globe, Users } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TimelineRow } from "@/features/chat/timeline";
import {
  MessageComposer,
  type ReplyTarget,
} from "@/features/chat/ui/MessageComposer";
import { ReadStateNotice } from "@/features/chat/ui/ReadStateNotice";
import { RelayStatus } from "@/features/chat/ui/RelayStatus";
import { TypingIndicator } from "@/features/chat/ui/TypingIndicator";
import {
  useChannelMessages,
  useDeleteMessage,
  useEditMessage,
  useMyPubkey,
  useToggleReaction,
} from "@/features/chat/use-chat";
import { usePresence, useTyping } from "@/features/chat/use-presence";
import { useEmojiCatalog } from "@/features/emoji/use-emoji";
import { HuddleBar } from "@/features/huddle/ui/HuddleBar";
import {
  togglePane,
  type ChannelPane,
} from "@/features/channels/channel-roster-model";
import { resolveChannelLabel } from "@/features/channels/dm-label";
import { ChannelRosterPanel } from "@/features/channels/ui/ChannelRosterPanel";
import { PublishChannelDialog } from "@/features/channels/ui/PublishChannelDialog";
import { computeChannelUnreadMarker } from "@/features/messages/lib/unread-marker";
import { useMuteList } from "@/features/moderation/use-moderation";
import { useProfiles } from "@/features/profile/profile-store";
import type { MessageRowActions } from "@/features/messages/ui/MessageRow";
import { MessageTimeline } from "@/features/messages/ui/MessageTimeline";
import { ThreadPanel } from "@/features/messages/ui/ThreadPanel";
import { useUnreadFrontier } from "@/features/messages/use-unread-frontier";
import { SearchResults } from "@/features/search/ui/SearchResults";
import {
  showsTimelineBesideThread,
  useThreadLayout,
} from "@/features/settings/use-thread-layout";
import { useShell } from "@/features/shell/shell-context";
import { ChannelWelcome } from "@/features/shell/ui/ChannelWelcome";
import { cn } from "@/shared/lib/cn";
import { SidebarTrigger } from "@/shared/ui/sidebar";

/** First line of a message, for the reply banner. */
function previewOf(content: string): string {
  const firstLine = content.split("\n")[0] ?? "";
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

export function ChatPage({
  channelId,
  query = "",
}: {
  channelId: string | null;
  /** Active search, from the URL. Empty means the timeline is showing. */
  query?: string;
}) {
  // Channels, read cursors, and unread state come from the shell so the sidebar
  // and this pane cannot disagree — see `shell-context.tsx`.
  const { channels, dms, readState } = useShell();
  // Where a thread opens, from Settings > Appearance. `full` hands the pane over to
  // the thread instead of splitting it — on a narrow window the split leaves the
  // timeline and the thread both too thin to read.
  const { layout: threadLayout } = useThreadLayout();
  const timeline = useChannelMessages(channelId);
  // A mute hides the person, which is the whole of what a mute means — there is
  // no "message hidden" placeholder, because a row announcing that someone spoke
  // is the thing the reader asked not to see.
  //
  // Applied to what is rendered, not to the read cursor below. A channel whose
  // newest message is from a muted author still has to become read, or its badge
  // would never clear and the mute would look like a bug.
  const muted = useMuteList();
  const rows = useMemo(
    () =>
      muted.size === 0
        ? timeline.rows
        : timeline.rows.filter(
            (row) => !muted.has(row.message.pubkey.toLowerCase()),
          ),
    [muted, timeline.rows],
  );
  const toggleReaction = useToggleReaction();
  const editMessage = useEditMessage(channelId);
  const deleteMessage = useDeleteMessage(channelId);
  const typing = useTyping(channelId);
  const emojiCatalog = useEmojiCatalog();
  const myPubkey = useMyPubkey();
  // Only the authors on screen: presence is read per-author, so asking about
  // everyone would grow the query with the community rather than the viewport.
  const visibleAuthors = useMemo(
    () => rows.map((row) => row.message.pubkey),
    [rows],
  );
  const presence = usePresence(visibleAuthors);
  // Same author set as presence: names and avatars are needed for exactly the
  // people on screen, and the store keeps whatever it has already resolved.
  const profiles = useProfiles(visibleAuthors);
  // A DM is titled by who is in it, which needs their profiles too — the authors
  // on screen are not necessarily all its participants.
  const dmParticipants = useMemo(
    () => dms.flatMap((dm) => dm.participantPubkeys),
    [dms],
  );
  const dmProfiles = useProfiles(dmParticipants);
  // Read the rows from a ref inside callbacks: depending on the array directly
  // would give every action a new identity on each delivered event, which is
  // exactly what defeats `React.memo` further down the tree.
  const timelineRowsRef = useRef(rows);
  timelineRowsRef.current = rows;
  // The reply target is stored with the channel it belongs to and read back only
  // for a match, so switching channels cannot post a reply into a thread that
  // does not exist in the new room — and no render sees a stale target.
  const [reply, setReply] = useState<{
    channelId: string;
    target: ReplyTarget;
  } | null>(null);
  const replyTo = reply?.channelId === channelId ? reply.target : null;
  // Same discipline for the side pane: a thread root from another channel would
  // render a panel of messages that are not in this room, and a roster left open
  // from a channel is still the right pane for the next one.
  //
  // One pane rather than two booleans — see `togglePane`. Two 288–384px panels
  // beside the timeline on a 1280px window leave it narrower than either.
  const [pane, setPane] = useState<{
    channelId: string;
    pane: ChannelPane;
  } | null>(null);
  const openPane = pane?.channelId === channelId ? pane.pane : null;
  const openThreadRootId = openPane?.kind === "thread" ? openPane.rootId : null;
  const [publishing, setPublishing] = useState(false);
  // In `full`, the thread replaces the timeline rather than sitting beside it.
  const timelineVisible =
    openThreadRootId === null || showsTimelineBesideThread(threadLayout);

  // Searched across both lists: a DM is not in `channels` (the relay marks it
  // hidden), and a header that could not find it would title the room "Channels".
  const activeChannel =
    [...channels, ...dms].find((channel) => channel.id === channelId) ?? null;
  const isDm = activeChannel?.type === "dm";
  const activeLabel = activeChannel
    ? resolveChannelLabel({
        channel: activeChannel,
        currentPubkey: myPubkey,
        profiles: dmProfiles,
      })
    : null;

  // The frontier as it stood at open, which is what the "New" divider is
  // measured against — see `use-unread-frontier.ts`.
  const frontier = useUnreadFrontier(
    channelId,
    readState.contexts,
    readState.loaded,
  );
  const unreadMarker = useMemo(
    () =>
      frontier === undefined
        ? { firstUnreadMessageId: null, unreadCount: 0 }
        : computeChannelUnreadMarker(rows, frontier, myPubkey),
    [frontier, rows, myPubkey],
  );

  // Reading the room marks it read up to its newest message. Driven by the
  // loaded timeline rather than the global activity feed, so the cursor never
  // jumps past a message this client has not actually shown.
  const newestShown =
    timeline.rows.length > 0
      ? timeline.rows[timeline.rows.length - 1].message.createdAt
      : null;
  useEffect(() => {
    if (!channelId || newestShown === null || !timeline.loaded) return;
    readState.markRead(channelId, newestShown);
  }, [channelId, newestShown, timeline.loaded, readState.markRead]);

  // Any author's message ends their typing indicator, not just this client's.
  // Without this someone stays "typing…" for the rest of the TTL after the
  // message they were writing is already on screen.
  const newestRow =
    timeline.rows.length > 0 ? timeline.rows[timeline.rows.length - 1] : null;
  const newestRowId = newestRow?.message.id ?? null;
  const completeTyping = typing.complete;
  useEffect(() => {
    if (!newestRow || newestRowId === null) return;
    completeTyping({
      pubkey: newestRow.message.pubkey,
      threadHeadId: newestRow.message.parentId,
    });
    // Keyed on the id so this fires once per message, not on every re-render.
  }, [newestRowId, newestRow, completeTyping]);

  const onReply = useCallback(
    (row: TimelineRow) => {
      if (!channelId) return;
      // Replying to a reply keeps the original thread root, so the thread stays
      // one tree instead of splitting at every level.
      const rootId = row.message.rootId ?? row.message.id;
      setReply({
        channelId,
        target: {
          rootId,
          parentId: row.message.id,
          authorPubkey: row.message.pubkey,
          preview: previewOf(row.content),
        },
      });
      // Open the thread being replied to: replies do not appear in the channel
      // timeline, so without this the reader would send into a thread they
      // cannot see. Opened outright rather than toggled — hitting reply must
      // never be the click that hides the thread being replied to.
      setPane({ channelId, pane: { kind: "thread", rootId } });
    },
    [channelId],
  );

  /**
   * Open a thread and aim the composer at it.
   *
   * The two have to move together. A panel open with the composer still aimed at
   * the channel is the trap: the reader is looking at a thread, types, and the
   * message lands in the room instead — the one place they could not see it.
   *
   * The summary row is a toggle, so clicking the thread that is already open
   * closes it; that also returns the composer to the channel, for the same
   * reason it has to follow the panel open.
   */
  const onOpenThread = useCallback(
    (rootId: string) => {
      if (!channelId) return;
      const next = togglePane(
        pane?.channelId === channelId ? pane.pane : null,
        { kind: "thread", rootId },
      );
      setPane(next === null ? null : { channelId, pane: next });
      if (next === null) {
        setReply(null);
        return;
      }
      const root = timelineRowsRef.current.find(
        (candidate) => candidate.message.id === rootId,
      );
      if (!root) return;
      setReply({
        channelId,
        target: {
          rootId,
          parentId: rootId,
          authorPubkey: root.message.pubkey,
          preview: previewOf(root.content),
        },
      });
    },
    [channelId, pane],
  );

  /** Close the side pane and return the composer to the channel. */
  const onClosePane = useCallback(() => {
    setPane(null);
    setReply(null);
  }, []);

  /** The roster, which replaces an open thread rather than crowding it. */
  const onToggleRoster = useCallback(() => {
    if (!channelId) return;
    const next = togglePane(pane?.channelId === channelId ? pane.pane : null, {
      kind: "roster",
    });
    setPane(next === null ? null : { channelId, pane: next });
    // The composer follows the thread panel, so a thread being replaced has to
    // let go of it — otherwise the reader is looking at the roster with the
    // composer still aimed at a thread they can no longer see.
    if (next === null || next.kind === "roster") setReply(null);
  }, [channelId, pane]);

  const onCopyLink = useCallback(
    (row: TimelineRow) => {
      if (!channelId) return;
      // An in-app URL, not a `nuxx://message` deep link: there is no desktop
      // client to hand one to, and a link that opens nothing is worse than none.
      const url = new URL(
        `/c/${channelId}?m=${row.message.id}`,
        window.location.origin,
      ).toString();
      void navigator.clipboard
        .writeText(url)
        .then(() => toast.success("Link copied"))
        .catch(() => toast.error("Could not copy the link"));
    },
    [channelId],
  );

  const rowActions = useMemo<MessageRowActions>(
    () => ({
      statusOf: presence.statusOf,
      emojiCatalog,
      onToggleReaction: ({ definition, ...input }) =>
        toggleReaction.mutate({
          ...input,
          ...(definition ? { customEmojiUrl: definition.url } : {}),
        }),
      onReply,
      onOpenThread,
      onCopyLink,
      onEdit: (input) =>
        editMessage.mutate(input, {
          onError: (error) =>
            toast.error(
              error instanceof Error ? error.message : "Could not edit",
            ),
        }),
      onDelete: (row) =>
        deleteMessage.mutate(
          { messageId: row.message.id },
          {
            onError: (error) =>
              toast.error(
                error instanceof Error ? error.message : "Could not delete",
              ),
          },
        ),
      myPubkey,
      profiles,
      pending:
        toggleReaction.isPending ||
        editMessage.isPending ||
        deleteMessage.isPending,
    }),
    [
      presence.statusOf,
      emojiCatalog,
      profiles,
      toggleReaction.mutate,
      toggleReaction.isPending,
      editMessage.mutate,
      editMessage.isPending,
      deleteMessage.mutate,
      deleteMessage.isPending,
      onReply,
      onOpenThread,
      onCopyLink,
      myPubkey,
    ],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="md:-ml-1" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">
                {query
                  ? `Search${activeLabel ? ` in ${isDm ? "" : "#"}${activeLabel}` : ""}`
                  : activeLabel
                    ? `${isDm ? "" : "#"}${activeLabel}`
                    : "Channels"}
              </h1>
              {activeChannel?.topic && (
                <p className="truncate text-2xs text-muted-foreground">
                  {activeChannel.topic}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ReadStateNotice
              canSync={readState.canSync}
              error={readState.error}
            />
            <RelayStatus />
            {/* Only on a private room, and only from the room itself — the scan
                needs the messages, which is what the sidebar does not have. */}
            {activeChannel?.isPrivate && !query && (
              <button
                aria-label={`${activeChannel.name} を公開する`}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="open-publish-channel"
                onClick={() => setPublishing(true)}
                type="button"
              >
                <Globe aria-hidden className="size-4" />
              </button>
            )}
            {channelId && !query && (
              <button
                aria-label="メンバー"
                aria-pressed={openPane?.kind === "roster"}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  openPane?.kind === "roster"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground",
                )}
                data-testid="toggle-roster"
                onClick={onToggleRoster}
                type="button"
              >
                <Users aria-hidden className="size-4" />
              </button>
            )}
          </div>
        </header>

        {query ? (
          <SearchResults
            channels={channels}
            query={query}
            scopeChannelId={channelId}
          />
        ) : channelId ? (
          <>
            {/* Hidden in `full`, where the thread has the pane. The header above
                still says which room this is and the composer below still sends
                into the thread, so only the timeline goes. */}
            {timelineVisible && (
              <MessageTimeline
                actions={rowActions}
                error={timeline.error}
                firstUnreadMessageId={unreadMarker.firstUnreadMessageId}
                hasMore={timeline.hasMore}
                isLoadingMore={timeline.isLoadingMore}
                loaded={timeline.loaded}
                onLoadOlder={timeline.loadOlder}
                rows={rows}
                unreadCount={unreadMarker.unreadCount}
              />
            )}
            <HuddleBar />
            <TypingIndicator typists={typing.typists} />
            <MessageComposer
              channelId={channelId}
              channelName={activeLabel ?? channelId}
              channelParticipants={activeChannel?.participantPubkeys}
              isDm={isDm}
              onCancelReply={onClosePane}
              onComposing={typing.announce}
              onSent={typing.complete}
              replyTo={replyTo}
            />
          </>
        ) : (
          <ChannelWelcome />
        )}
      </section>

      {!query && openThreadRootId !== null && (
        <ThreadPanel
          actions={rowActions}
          onClose={onClosePane}
          rootId={openThreadRootId}
          rows={rows}
          // In `full` the thread takes the space the timeline was using rather than
          // sitting in a 384px column beside an empty one.
          wide={!timelineVisible}
        />
      )}

      {!query && openPane?.kind === "roster" && (
        <ChannelRosterPanel
          // A DM has no roster to name: the two people in it are the title.
          channelName={isDm ? null : activeLabel}
          onClose={onClosePane}
          statusOf={presence.statusOf}
        />
      )}

      {publishing && activeChannel && (
        <PublishChannelDialog
          channelId={activeChannel.id}
          channelName={activeLabel ?? activeChannel.name}
          messageCount={rows.length}
          onClose={() => setPublishing(false)}
          onPublished={() => setPublishing(false)}
          // The loaded timeline, which is what this client can actually read.
          // A scan that claimed to cover history it never fetched would be the
          // more dangerous kind of wrong.
          scanTargets={rows.map((row) => ({
            where: row.message.id,
            text: row.message.content,
          }))}
          selfPubkey={myPubkey}
        />
      )}
    </div>
  );
}
