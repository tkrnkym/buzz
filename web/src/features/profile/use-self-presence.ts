import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildPresenceTemplate,
  type PresenceStatus,
} from "@/features/chat/presence";
import { useMyPubkey } from "@/features/chat/use-chat";
import { useRelaySession } from "@/shared/api/relay-provider";

/**
 * How often to re-assert presence.
 *
 * Kind 20001 is ephemeral and the relay expires it, so presence is a claim that
 * has to be repeated. Comfortably inside the relay's TTL, so a reader does not
 * flicker offline between beats.
 */
const HEARTBEAT_MS = 30_000;

const STORAGE_KEY = "nuxx-presence";

function isPresenceStatus(value: string | null): value is PresenceStatus {
  return value === "online" || value === "away" || value === "offline";
}

function readStoredStatus(): PresenceStatus {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isPresenceStatus(stored)) return stored;
  } catch {
    // A blocked localStorage just means the choice lasts one session.
  }
  return "online";
}

export interface SelfPresenceApi {
  status: PresenceStatus;
  setStatus: (status: PresenceStatus) => void;
}

/**
 * The reader's own presence, and the heartbeat that keeps it true.
 *
 * The heartbeat re-publishes the **chosen** status, not `"online"`. That is the
 * whole point of this hook existing: the heartbeat used to live in the read-side
 * `usePresence` and always claimed "online", which meant a reader who went
 * invisible was put back online by the next beat — a privacy choice undone
 * within thirty seconds, silently.
 *
 * The choice is stored locally because kind 20001 is never stored: there is
 * nothing to read back, so the only place "what did I choose" can live is here.
 */
export function useSelfPresence(): SelfPresenceApi {
  const session = useRelaySession();
  const myPubkey = useMyPubkey();
  const [status, setStatusState] = useState<PresenceStatus>(readStoredStatus);
  // The beat reads the ref, so changing the status does not restart the interval
  // — which would let a reader toggling twice miss a beat entirely.
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (!myPubkey) return;
    const beat = () => {
      void session
        .publish(buildPresenceTemplate(statusRef.current))
        .catch(() => {
          // Fire-and-forget: a missed beat expires in Redis on its own.
        });
    };
    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [session, myPubkey]);

  const setStatus = useCallback(
    (next: PresenceStatus) => {
      setStatusState(next);
      statusRef.current = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // See `readStoredStatus`.
      }
      // Published immediately as well as on the next beat, so the change is
      // visible to others now rather than up to a heartbeat later.
      void session.publish(buildPresenceTemplate(next)).catch(() => {});
    },
    [session],
  );

  return { status, setStatus };
}
