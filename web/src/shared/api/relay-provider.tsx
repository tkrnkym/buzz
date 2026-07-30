/**
 * React binding for the {@link RelaySession}.
 *
 * One session per relay URL, created on mount and torn down on unmount. The
 * session key includes the URL so a community switch replaces the session rather
 * than mutating it — the same "remount the community-scoped subtree" discipline
 * the desktop app uses.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  RelaySession,
  type RelayConnectionState,
} from "@/shared/api/relay-session";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { resolveSigner } from "@/shared/lib/signer";

const RelaySessionContext = createContext<RelaySession | null>(null);

export function RelaySessionProvider({
  children,
  url,
}: {
  children: ReactNode;
  url?: string;
}) {
  const resolvedUrl = url ?? relayWsUrl();
  const session = useMemo(
    () => new RelaySession({ url: resolvedUrl, signer: resolveSigner() }),
    [resolvedUrl],
  );

  useEffect(() => {
    session.connect();
    return () => session.close();
  }, [session]);

  return (
    <RelaySessionContext.Provider value={session}>
      {children}
    </RelaySessionContext.Provider>
  );
}

export function useRelaySession(): RelaySession {
  const session = useContext(RelaySessionContext);
  if (!session) {
    throw new Error(
      "useRelaySession must be used inside <RelaySessionProvider>",
    );
  }
  return session;
}

/** Subscribe to the session's connection state for status UI. */
export function useRelayConnectionState(): RelayConnectionState {
  const session = useRelaySession();
  const [state, setState] = useState<RelayConnectionState>(() =>
    session.getState(),
  );

  useEffect(() => {
    // Re-read on subscribe: the state can have moved between render and effect.
    setState(session.getState());
    return session.onStateChange(setState);
  }, [session]);

  return state;
}
