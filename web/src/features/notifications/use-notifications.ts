import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMyPubkey } from "@/features/chat/use-chat";
import { useMuteList } from "@/features/moderation/use-moderation";
import { buildActionNotifications } from "@/features/notifications/action-notifications";
import {
  playNotificationSound,
  showDesktopNotification,
} from "@/features/notifications/announce";
import {
  DEFAULT_PREFS,
  type NotificationPrefs,
  readPrefs,
  shouldAnnounce,
  writePrefs,
} from "@/features/notifications/notification-prefs";
import {
  buildDmMessagesFilter,
  buildMentionFilter,
  buildNotifications,
  buildOwnMessagesFilter,
  buildRepliesFilter,
  type NotificationItem,
  notificationTitle,
  truncateBody,
  unreadNotificationCount,
} from "@/features/notifications/notifications-model";
import { useUserLabels } from "@/features/profile/use-user-label";
import { useShell } from "@/features/shell/shell-context";
import { useShowcase } from "@/features/showcase/use-showcase";
import { useRelaySession } from "@/shared/api/relay-provider";
import type { NostrEvent } from "@/shared/lib/nostr-client";

/** Newest first, same tie-break as `buildNotifications` — so a merge of the
 * two sources reads as one timeline rather than two lists stitched together. */
function sortByRecency(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort(
    (left, right) =>
      right.createdAt - left.createdAt || left.id.localeCompare(right.id),
  );
}

export interface NotificationsApi {
  items: NotificationItem[];
  unreadCount: number;
  /** False until the first EOSE, so a list can stay quiet rather than empty. */
  loaded: boolean;
}

/**
 * Everything addressed to this reader.
 *
 * Three subscriptions, described in `notifications-model`. Events accumulate in
 * one map keyed by id because the filters overlap by design — a DM that mentions
 * you arrives on two of them — and because a reconnect re-sends every filter,
 * so `onEvent` has to tolerate a repeat.
 */
export function useNotifications(): NotificationsApi {
  const session = useRelaySession();
  const myPubkey = useMyPubkey();
  const { channels, dms, readState } = useShell();
  const muted = useMuteList();
  const showcase = useShowcase();

  const [events, setEvents] = useState<Map<string, NostrEvent>>(
    () => new Map(),
  );
  const [ownIds, setOwnIds] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);

  const collect = useCallback((event: NostrEvent) => {
    setEvents((previous) => {
      if (previous.has(event.id)) return previous;
      const next = new Map(previous);
      next.set(event.id, event);
      return next;
    });
  }, []);

  // Mentions and DMs. One filter; the category is decided on read.
  useEffect(() => {
    if (!myPubkey) return;
    return session.subscribe(buildMentionFilter(myPubkey), {
      onEvent: collect,
      onEose: () => setLoaded(true),
    });
  }, [collect, myPubkey, session]);

  // Messages in the reader's DMs. A separate filter because a DM's messages carry
  // no `p` tag — see `buildDmMessagesFilter`.
  const dmChannelKey = useMemo(
    () =>
      dms
        .map((channel) => channel.id)
        .sort()
        .join(","),
    [dms],
  );
  useEffect(() => {
    const filter = buildDmMessagesFilter(
      dmChannelKey ? dmChannelKey.split(",") : [],
    );
    if (!filter) return;
    return session.subscribe(filter, {
      onEvent: collect,
      onEose: () => undefined,
    });
  }, [collect, dmChannelKey, session]);

  // The reader's own messages, which is the only way to learn their event ids —
  // and therefore the only way to recognize a reply to one.
  useEffect(() => {
    if (!myPubkey) return;
    return session.subscribe(buildOwnMessagesFilter(myPubkey), {
      onEvent: (event) =>
        setOwnIds((previous) =>
          previous.has(event.id) ? previous : new Set(previous).add(event.id),
        ),
      onEose: () => undefined,
    });
  }, [myPubkey, session]);

  // Replies to those. Re-subscribed as the id set grows, which is why it is keyed
  // on a sorted join rather than the Set's identity.
  const ownIdKey = useMemo(() => [...ownIds].sort().join(","), [ownIds]);
  useEffect(() => {
    const filter = buildRepliesFilter(ownIdKey ? ownIdKey.split(",") : []);
    if (!filter) return;
    return session.subscribe(filter, {
      onEvent: collect,
      onEose: () => undefined,
    });
  }, [collect, ownIdKey, session]);

  const dmChannelIds = useMemo(
    () => new Set(dms.map((channel) => channel.id)),
    [dms],
  );

  const items = useMemo(() => {
    const fromMessages = buildNotifications({
      events: [...events.values()],
      dmChannelIds,
      mutedPubkeys: muted,
      myPubkey,
      ownMessageIds: ownIds,
    });
    // Showcase-only: there is no relay event yet for a held workflow run, so
    // this is the one source of "action" items and only exists in the demo
    // build — a client pointed at a real relay never shows an invented one.
    const fromActions = showcase
      ? buildActionNotifications(
          showcase.workflows,
          Math.floor(Date.now() / 1000),
        )
      : [];
    return fromActions.length === 0
      ? fromMessages
      : sortByRecency([...fromMessages, ...fromActions]);
  }, [dmChannelIds, events, muted, myPubkey, ownIds, showcase]);

  const unreadCount = useMemo(
    () => unreadNotificationCount(items, readState.contexts),
    [items, readState.contexts],
  );

  // Announcing lives here rather than in a component so it happens once per
  // arrival no matter how many places render the list.
  useAnnounceNewNotifications({
    channels: [...channels, ...dms],
    items,
    loaded,
  });

  return { items, unreadCount, loaded };
}

/**
 * Read and write the notification preferences.
 *
 * Seeded from storage during the first render rather than in an effect, so the
 * Settings toggles never paint in the default state and then flip.
 */
export function useNotificationPrefs(): {
  prefs: NotificationPrefs;
  setPrefs: (next: NotificationPrefs) => void;
} {
  const myPubkey = useMyPubkey();
  const [state, setState] = useState<{
    pubkey: string | null;
    prefs: NotificationPrefs;
  }>(() => ({ pubkey: myPubkey, prefs: readPrefs(myPubkey) }));

  // Derived during render, not in an effect: the preferences are keyed by
  // identity, and an effect would leave one render showing the other reader's.
  if (state.pubkey !== myPubkey) {
    setState({ pubkey: myPubkey, prefs: readPrefs(myPubkey) });
  }

  const setPrefs = useCallback(
    (next: NotificationPrefs) => {
      writePrefs(myPubkey, next);
      setState({ pubkey: myPubkey, prefs: next });
    },
    [myPubkey],
  );

  return { prefs: state.prefs, setPrefs };
}

/**
 * Raise a popup and a sound for notifications that arrive while running.
 *
 * Every id present at the first load is recorded as already-seen, so opening the
 * app does not fire a burst for a week of history. That is the whole reason this
 * is a ref rather than derived state: "new since this session started" is not a
 * property of the data.
 */
function useAnnounceNewNotifications({
  channels,
  items,
  loaded,
}: {
  channels: { id: string; name: string }[];
  items: NotificationItem[];
  loaded: boolean;
}) {
  const { prefs } = useNotificationPrefs();
  const seen = useRef<Set<string> | null>(null);
  const authorPubkeys = useMemo(
    () => items.slice(0, 20).map((item) => item.authorPubkey),
    [items],
  );
  const labels = useUserLabels(authorPubkeys);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    if (!loaded) return;
    if (seen.current === null) {
      seen.current = new Set(items.map((item) => item.id));
      return;
    }
    const fresh = items.filter((item) => !seen.current?.has(item.id));
    for (const item of fresh) seen.current.add(item.id);
    if (fresh.length === 0) return;

    const documentHidden = document.visibilityState === "hidden";
    let played = false;
    for (const item of fresh) {
      if (
        !shouldAnnounce({
          category: item.category,
          documentHidden,
          prefs: prefsRef.current,
        })
      ) {
        continue;
      }
      if (prefsRef.current.desktop) {
        const channelName = channelsRef.current.find(
          (channel) => channel.id === item.channelId,
        )?.name;
        showDesktopNotification({
          body: truncateBody(item.content, "新しいメッセージ"),
          tag: item.id,
          title: notificationTitle(item, {
            authorLabel:
              item.authorLabel ?? labelsRef.current.nameOf(item.authorPubkey),
            ...(channelName ? { channelName } : {}),
          }),
        });
      }
      // Once per batch. Ten mentions arriving together should not be ten chimes.
      if (prefsRef.current.sound && !played) {
        played = playNotificationSound(prefsRef.current.sounds[item.category]);
      }
    }
  }, [items, loaded]);
}

export { DEFAULT_PREFS };
