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
  const [error, setError] = useState<string | null>(null);

  // Held in a ref as well as state: the publish path needs the newest values
  // without re-creating `markRead` on every cursor change.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const clientIdRef = useRef<string>(randomSlotId());
  const publishingRef = useRef(false);

  useEffect(() => {
    if (!myPubkey || !canSync) return;
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
        setSnapshot((previous) => ({
          ...folded,
          contexts: mergeContexts(previous.contexts, folded.contexts),
        }));
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load read state",
          );
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [session, signer, myPubkey, canSync]);

  const markRead = useCallback(
    (channelId: string, readAt: number) => {
      if (!canSync || !myPubkey) return;

      const current = snapshotRef.current;
      const existing = current.contexts[channelId];
      // Cursors only move forward, so re-reading older history is not a write.
      if (existing !== undefined && existing >= readAt) return;

      const contexts = mergeContexts(current.contexts, {
        [channelId]: readAt,
      });
      // Reflect it immediately: the badge should clear on read, not on round trip.
      setSnapshot({ ...current, contexts });

      if (publishingRef.current) return;
      publishingRef.current = true;

      void (async () => {
        try {
          const slotId = current.slotId ?? clientIdRef.current;
          const blob = buildReadStateBlob(clientIdRef.current, contexts);
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
            snapshotRef.current.newestCreatedAt,
          );
          const ciphertext = await signer.encryptToSelf(JSON.stringify(blob));
          await session.publish(
            buildReadStateTemplate(slotId, ciphertext, createdAt),
          );
          setSnapshot((previous) => ({
            contexts: previous.contexts,
            newestCreatedAt: createdAt,
            slotId,
          }));
          setError(null);
        } catch (publishError) {
          setError(
            publishError instanceof Error
              ? publishError.message
              : "Could not save read state",
          );
        } finally {
          publishingRef.current = false;
        }
      })();
    },
    [session, signer, myPubkey, canSync],
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
      error,
      markRead,
      isChannelUnread,
    }),
    [snapshot.contexts, canSync, error, markRead, isChannelUnread],
  );
}
