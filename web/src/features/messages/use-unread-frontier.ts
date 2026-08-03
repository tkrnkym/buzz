import { useEffect, useRef, useState } from "react";

/**
 * The read frontier for a channel as it stood when the channel was opened.
 *
 * Opening a channel immediately advances the live read cursor to the newest
 * loaded message, so a "New" divider computed from the live value would always
 * sit at the bottom and never mark anything. This captures the cursor once per
 * channel, before that advance, and holds it for as long as the channel stays
 * open — which is what makes the divider stay where the reader left off while
 * they read past it.
 *
 * `undefined` means "not captured yet": the read state is still loading, and
 * treating that as "never read" would flash a divider above the whole channel.
 */
export function useUnreadFrontier(
  channelId: string | null,
  contexts: Record<string, number>,
  /** False until read state has actually arrived from the relay. */
  ready: boolean,
): number | null | undefined {
  const [frontier, setFrontier] = useState<number | null | undefined>(
    undefined,
  );
  // Which channel the held value belongs to, so a switch cannot show the old
  // channel's frontier against the new channel's messages.
  const capturedFor = useRef<string | null>(null);
  // Read from a ref so a later cursor advance does not re-run the capture.
  const contextsRef = useRef(contexts);
  contextsRef.current = contexts;

  useEffect(() => {
    if (channelId === null) {
      capturedFor.current = null;
      setFrontier(undefined);
      return;
    }
    if (!ready || capturedFor.current === channelId) return;
    capturedFor.current = channelId;
    setFrontier(contextsRef.current[channelId] ?? null);
  }, [channelId, ready]);

  return channelId !== null && capturedFor.current === channelId
    ? frontier
    : undefined;
}
