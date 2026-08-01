import { useCallback, useEffect, useRef, useState } from "react";

import { useMyPubkey } from "@/features/chat/use-chat";
import {
  draftKeys,
  readDraft,
  writeDraft,
} from "@/features/messages/lib/drafts";

/**
 * How long the composer stays quiet before a draft is written.
 *
 * A write per keystroke would serialize the whole draft store on every
 * character; a few hundred milliseconds of stillness is well inside the window
 * where someone might switch rooms or close the tab.
 */
const DEBOUNCE_MS = 400;

/**
 * Fired after a draft is written, so other views can re-read the store.
 *
 * `localStorage` only raises `storage` in *other* tabs, so a sidebar in this one
 * would otherwise never learn that the composer beside it now holds text. The
 * event lives here rather than in `lib/drafts` so that module stays a pure
 * function of a `Storage`, testable without a DOM.
 */
export const DRAFTS_CHANGED_EVENT = "nuxx:drafts-changed";

function announceChange(): void {
  window.dispatchEvent(new Event(DRAFTS_CHANGED_EVENT));
}

/**
 * The text in one composer, restored across channel switches and reloads.
 *
 * This owns the text rather than mirroring state the composer keeps, because
 * mirroring cannot be made correct: the composer is one long-lived component
 * that gets re-pointed at a different room, and an effect that re-seeds it does
 * not fire when the two rooms' drafts happen to be equal — the ordinary case of
 * both being empty. The result was text following the reader into the next room.
 * Deriving from the key during render has no such gap.
 *
 * Only the *write* is debounced. Typing updates the returned text immediately.
 */
export function useDraft({
  channelId,
  threadRootId = null,
}: {
  channelId: string | null;
  threadRootId?: string | null;
}): {
  /** What is in the composer now. */
  text: string;
  setText: (value: string) => void;
  /** Drop it — after a successful send, not after a failed one. */
  clear: () => void;
} {
  const myPubkey = useMyPubkey();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The latest text, so a flush writes what was actually typed. */
  const pending = useRef<string | null>(null);
  const pubkeyRef = useRef(myPubkey);
  pubkeyRef.current = myPubkey;

  const read = useCallback(() => {
    if (!channelId) return "";
    return readDraft(
      window.localStorage,
      pubkeyRef.current,
      { channelId, threadRootId },
      Date.now(),
    );
  }, [channelId, threadRootId]);

  // A space cannot appear in a channel id or an event id, so the two halves of
  // the key can never run together into one that means something else.
  const keyId = channelId ? `${channelId} ${threadRootId ?? ""}` : "";
  const [state, setState] = useState(() => ({ id: keyId, text: read() }));
  if (state.id !== keyId) {
    // React's documented way to derive state from props: it re-renders
    // immediately, so nobody ever sees the previous room's text.
    setState({ id: keyId, text: read() });
  }

  /**
   * Write the pending text against an explicit key.
   *
   * Explicit because the flush that matters is the one on the way *out* of a
   * composer: by the time an effect cleanup runs, the props already name the
   * composer being switched to, and writing there would move the text into the
   * room the reader just opened.
   */
  const flushTo = useCallback(
    (key: { channelId: string; threadRootId: string | null }) => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (pending.current === null) return;
      writeDraft(
        window.localStorage,
        pubkeyRef.current,
        key,
        pending.current,
        Date.now(),
      );
      pending.current = null;
      announceChange();
    },
    [],
  );

  useEffect(() => {
    if (!channelId) return;
    const key = { channelId, threadRootId };
    return () => flushTo(key);
  }, [channelId, threadRootId, flushTo]);

  const setText = useCallback(
    (value: string) => {
      if (!channelId) return;
      setState({ id: keyId, text: value });
      pending.current = value;
      if (timer.current !== null) clearTimeout(timer.current);
      const key = { channelId, threadRootId };
      timer.current = setTimeout(() => flushTo(key), DEBOUNCE_MS);
    },
    [channelId, threadRootId, keyId, flushTo],
  );

  const clear = useCallback(() => {
    if (!channelId) return;
    setState({ id: keyId, text: "" });
    pending.current = "";
    flushTo({ channelId, threadRootId });
  }, [channelId, threadRootId, keyId, flushTo]);

  return { text: state.text, setText, clear };
}

/**
 * Channel ids that currently hold unsent text.
 *
 * Re-read on the local change event and on `storage` (another tab), rather than
 * polled: a draft marker that appears a second late reads as a bug, and one that
 * never appears at all is worse.
 */
export function useDraftChannels(): ReadonlySet<string> {
  const myPubkey = useMyPubkey();
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const refresh = () => {
      const keys = draftKeys(window.localStorage, myPubkey, Date.now());
      // A thread draft belongs to its channel for this purpose: the reader is
      // looking for "where did I leave something unsent".
      setIds(new Set(keys.map((key) => key.split("/")[0])));
    };
    refresh();
    window.addEventListener(DRAFTS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(DRAFTS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [myPubkey]);

  return ids;
}
