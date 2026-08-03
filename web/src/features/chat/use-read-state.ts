/**
 * Read state synced through the relay.
 *
 * Everything durable lives on the relay: the browser holds no read positions of
 * its own, so a different browser or device sees the same cursors. See
 * `read-state.ts` for the wire format and the relay-side rules it has to satisfy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRelaySession } from "@/shared/api/relay-provider";
import { resolveSigner } from "@/shared/lib/signer";
import type { NostrEvent } from "@/shared/lib/nostr-client";
import {
  EMPTY_READ_STATE,
  type ReadStateBlob,
  type ReadStateSnapshot,
  buildReadStateBlob,
  buildReadStateFilter,
  buildReadStateTemplate,
  fitsSlotBudget,
  foldReadState,
  isUnread,
  isValidBlob,
  mergeContexts,
  nextCreatedAt,
} from "@/features/chat/read-state";
import { useMyPubkey } from "@/features/chat/use-chat";

/** 32 lowercase hex characters, matching the relay's slot pattern. */
function randomSlotId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface ReadStateApi {
  /** Read cursors by context key, merged across every device's slots. */
  contexts: Record<string, number>;
  /**
   * Whether cursors can be persisted at all.
   *
   * False when the signer cannot do NIP-44 — some NIP-07 extensions omit it. The
   * UI says so rather than letting mark-as-read silently do nothing.
   */
  canSync: boolean;
  /**
   * Whether the relay read has settled.
   *
   * Anything that has to distinguish "never read" from "not loaded yet" must
   * wait on this — the unread divider in particular, which would otherwise
   * flash above a whole channel on every open. True once the load resolves, and
   * also when there is nothing to load (no signer, or no NIP-44), because in
   * that case the empty cursor set is the final answer rather than a stale one.
   */
  loaded: boolean;
  /** Populated when a publish or decrypt failed, for display. */
  error: string | null;
  markRead: (channelId: string, readAt: number) => void;
  isChannelUnread: (
    channelId: string,
    latestActivityAt: number | null,
  ) => boolean;
}

export function useReadState(): ReadStateApi {
  const session = useRelaySession();
  const myPubkey = useMyPubkey();
  // Resolved once per mount. `resolveSigner()` returns a fresh object each call,
  // so using it directly would change the identity of every hook that depends on
  // it on every render — which turned the load effect into a republish loop.
  const signer = useMemo(() => resolveSigner(), []);
  const canSync = signer.canEncrypt;

  const [snapshot, setSnapshot] = useState<ReadStateSnapshot>(EMPTY_READ_STATE);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs, not state, are what the publisher reads. `setState` is asynchronous,
  // so a second mark-as-read arriving in the same tick would otherwise build its
  // blob from cursors that do not yet include the first one.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const clientIdRef = useRef<string>(randomSlotId());
  const publishingRef = useRef(false);
  /** A cursor advanced while a publish was in flight, still to be written. */
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!myPubkey || !canSync) {
      // Nothing to fetch. The empty cursor set is the answer, not a placeholder,
      // so consumers must not keep waiting on it.
      setLoaded(true);
      return;
    }
    let active = true;

    const load = async () => {
      try {
        const events = await session.query(buildReadStateFilter(myPubkey));
        const entries: Array<{ event: NostrEvent; blob: ReadStateBlob }> = [];
        for (const event of events) {
          try {
            const parsed: unknown = JSON.parse(
              await signer.decryptFromSelf(event.content),
            );
            if (isValidBlob(parsed)) entries.push({ event, blob: parsed });
          } catch {
            // One unreadable slot must not discard the others — a blob written by
            // a future format, or by a key this signer no longer holds, is simply
            // skipped.
          }
        }
        if (!active) return;
        const folded = foldReadState(entries);
        // Merge rather than replace: a cursor this session already advanced
        // must not be pulled back to whatever the relay last stored, or the
        // badge reappears and the client republishes in a loop.
        setSnapshot((previous) => {
          const merged = {
            ...folded,
            contexts: mergeContexts(previous.contexts, folded.contexts),
          };
          snapshotRef.current = merged;
          return merged;
        });
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load read state",
          );
        }
      } finally {
        // Loaded either way: a failed read is a settled one, and a divider that
        // never appears is worse than one computed from no cursors.
        if (active) setLoaded(true);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [session, signer, myPubkey, canSync]);

  /**
   * Write the current cursors to the relay, coalescing concurrent requests.
   *
   * A publish that arrives while one is in flight is not dropped — it sets a
   * pending flag, and the loop runs again with whatever the cursors are by then.
   * Dropping it would leave a cursor that only ever existed in this tab, so the
   * badge would come back on reload.
   */
  const publishReadState = useCallback(async () => {
    if (publishingRef.current) {
      pendingRef.current = true;
      return;
    }
    publishingRef.current = true;
    try {
      do {
        pendingRef.current = false;
        const current = snapshotRef.current;
        const slotId = current.slotId ?? clientIdRef.current;
        const blob = buildReadStateBlob(clientIdRef.current, current.contexts);
        if (!fitsSlotBudget(blob)) {
          // Slot splitting is desktop behaviour not ported yet. Refusing the
          // write keeps the stored blob valid instead of publishing something
          // the relay or another client would reject.
          throw new Error(
            "Read state is too large to publish from this client",
          );
        }
        const createdAt = nextCreatedAt(
          Math.floor(Date.now() / 1000),
          current.newestCreatedAt,
        );
        const ciphertext = await signer.encryptToSelf(JSON.stringify(blob));
        await session.publish(
          buildReadStateTemplate(slotId, ciphertext, createdAt),
        );
        const written = {
          ...snapshotRef.current,
          newestCreatedAt: createdAt,
          slotId,
        };
        snapshotRef.current = written;
        setSnapshot(written);
        setError(null);
      } while (pendingRef.current);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Could not save read state",
      );
    } finally {
      publishingRef.current = false;
    }
  }, [session, signer]);

  const markRead = useCallback(
    (channelId: string, readAt: number) => {
      if (!canSync || !myPubkey) return;

      const current = snapshotRef.current;
      const existing = current.contexts[channelId];
      // Cursors only move forward, so re-reading older history is not a write.
      if (existing !== undefined && existing >= readAt) return;

      const advanced = {
        ...current,
        contexts: mergeContexts(current.contexts, { [channelId]: readAt }),
      };
      // Ref first: the publisher must see this cursor even if it runs before
      // React has re-rendered. State follows so the badge clears on read rather
      // than on round trip.
      snapshotRef.current = advanced;
      setSnapshot(advanced);

      void publishReadState();
    },
    [canSync, myPubkey, publishReadState],
  );

  const isChannelUnread = useCallback(
    (channelId: string, latestActivityAt: number | null) =>
      isUnread(snapshotRef.current.contexts, channelId, latestActivityAt),
    [],
  );

  return useMemo(
    () => ({
      contexts: snapshot.contexts,
      canSync,
      loaded,
      error,
      markRead,
      isChannelUnread,
    }),
    [snapshot.contexts, canSync, loaded, error, markRead, isChannelUnread],
  );
}
