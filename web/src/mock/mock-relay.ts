/**
 * In-browser mock relay for the standalone demo (GitHub Pages).
 *
 * Two halves, matching the two paths the client actually uses:
 *
 * - a `RelaySocketFactory` that speaks the same frames the real relay does
 *   (AUTH challenge, REQ/EVENT/EOSE, publish OK + live echo), plugged into
 *   `RelaySession` through the seam its unit tests already use;
 * - a `fetch` wrapper for the HTTP bridge (`POST /query`), which serves the
 *   reads the app deliberately keeps off the socket: activity snapshots,
 *   presence, scrollback pages, and NIP-50 search.
 *
 * The e2e suite has its own Playwright-side twin of this (see
 * `tests/e2e/smoke.spec.ts`); this one runs where Playwright cannot — inside
 * the deployed page itself. Everything is enabled only behind
 * `VITE_MOCK_RELAY=1`, loaded via dynamic import so the production bundle
 * carries none of it.
 */

import {
  KIND_CHANNEL_ACTIVITY_SNAPSHOT,
  KIND_PRESENCE_UPDATE,
  KIND_PROFILE,
  KIND_STREAM_MESSAGE,
} from "@/shared/constants/kinds";
import type {
  RelaySocket,
  RelaySocketFactory,
} from "@/shared/api/relay-session";
import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";

import { ACTIVITY, OLDER_MESSAGES, PRESENCE, SEEDED } from "./demo-data";

/** Events the mock knows about, newest first. Publishes append here. */
const store: NostrEvent[] = [...SEEDED].sort(
  (a, b) => b.created_at - a.created_at,
);

type CursorFilter = NostrFilter & {
  before_id?: string;
  page?: number;
  search?: string;
};

function tagValues(event: NostrEvent, name: string): string[] {
  return event.tags
    .filter((tag) => tag[0] === name && typeof tag[1] === "string")
    .map((tag) => tag[1] as string);
}

/** Generic NIP-01 filter match — kinds/authors/ids/#tags/since/until. */
function matches(filter: NostrFilter, event: NostrEvent): boolean {
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.since !== undefined && event.created_at < filter.since)
    return false;
  if (filter.until !== undefined && event.created_at > filter.until)
    return false;
  for (const [key, wanted] of Object.entries(filter)) {
    if (!key.startsWith("#") || !Array.isArray(wanted)) continue;
    const values = tagValues(event, key.slice(1));
    if (!wanted.some((w) => values.includes(String(w)))) return false;
  }
  return true;
}

function select(filter: NostrFilter): NostrEvent[] {
  const hits = store.filter((event) => matches(filter, event));
  return filter.limit !== undefined ? hits.slice(0, filter.limit) : hits;
}

/** Shard the seeded activity the way the relay does (uuid tail mod 16). */
function activitySnapshots(): NostrEvent[] {
  const byShard = new Map<number, Record<string, number>>();
  for (const [channelId, at] of Object.entries(ACTIVITY)) {
    const shard =
      Number.parseInt(channelId.replace(/-/g, "").slice(-8), 16) % 16;
    byShard.set(shard, { ...(byShard.get(shard) ?? {}), [channelId]: at });
  }
  return [...byShard].map(([shard, channels]) => ({
    id: `39007${shard}`.padEnd(64, "0"),
    pubkey: "f".repeat(64),
    kind: KIND_CHANNEL_ACTIVITY_SNAPSHOT,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["d", `activity:${shard}`]],
    content: JSON.stringify({ shard, channels }),
    sig: "0".repeat(128),
  }));
}

interface LiveSub {
  subId: string;
  filter: NostrFilter;
  socket: MockSocket;
}

const liveSubs: LiveSub[] = [];

function broadcast(event: NostrEvent): void {
  for (const sub of liveSubs) {
    if (matches(sub.filter, event)) {
      sub.socket.emit(["EVENT", sub.subId, event]);
    }
  }
}

class MockSocket implements RelaySocket {
  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    // Open asynchronously, as a real WebSocket would, then challenge — the
    // session's NIP-42 path runs for real against the ephemeral signer.
    queueMicrotask(() => {
      this.onopen?.();
      this.emit(["AUTH", "mock-relay-challenge"]);
    });
  }

  emit(frame: unknown[]): void {
    this.onmessage?.(JSON.stringify(frame));
  }

  send(data: string): void {
    const frame = JSON.parse(data) as unknown[];
    const [verb] = frame;

    if (verb === "AUTH") {
      const signed = frame[1] as NostrEvent;
      this.emit(["OK", signed.id, true, ""]);
      return;
    }

    if (verb === "EVENT") {
      const event = frame[1] as NostrEvent;
      store.unshift(event);
      this.emit(["OK", event.id, true, ""]);
      broadcast(event);
      return;
    }

    if (verb === "REQ") {
      const subId = frame[1] as string;
      const filter = (frame[2] ?? {}) as NostrFilter;
      liveSubs.push({ subId, filter, socket: this });
      const stored = filter.kinds?.includes(KIND_CHANNEL_ACTIVITY_SNAPSHOT)
        ? activitySnapshots()
        : select(filter);
      for (const event of stored) this.emit(["EVENT", subId, event]);
      this.emit(["EOSE", subId]);
      return;
    }

    if (verb === "CLOSE") {
      const subId = frame[1] as string;
      const index = liveSubs.findIndex(
        (sub) => sub.subId === subId && sub.socket === this,
      );
      if (index >= 0) liveSubs.splice(index, 1);
    }
  }

  close(): void {
    for (let i = liveSubs.length - 1; i >= 0; i--) {
      if (liveSubs[i].socket === this) liveSubs.splice(i, 1);
    }
    this.onclose?.();
  }
}

function answerQuery(filters: CursorFilter[]): NostrEvent[] {
  const events: NostrEvent[] = [];
  for (const filter of filters) {
    if (filter.kinds?.includes(KIND_CHANNEL_ACTIVITY_SNAPSHOT)) {
      events.push(...activitySnapshots());
    } else if (filter.kinds?.includes(KIND_PROFILE)) {
      // Profiles come from the same store as everything else, so a profile the
      // demo visitor publishes is the one the timeline then shows them by.
      events.push(...store.filter((event) => matches(filter, event)));
    } else if (filter.kinds?.includes(KIND_PRESENCE_UPDATE)) {
      events.push(...PRESENCE.filter((event) => matches(filter, event)));
    } else if (filter.search !== undefined) {
      const needle = filter.search.toLowerCase();
      const page = filter.page ?? 1;
      // Search covers the paged-out history too — the relay's FTS does.
      const corpus = [...store, ...OLDER_MESSAGES];
      const hits = corpus.filter(
        (event) =>
          matches({ ...filter, search: undefined } as NostrFilter, event) &&
          event.content.toLowerCase().includes(needle),
      );
      const size = filter.limit ?? 20;
      events.push(...hits.slice((page - 1) * size, page * size));
    } else if (filter.before_id !== undefined) {
      // Scrollback page: everything strictly older than the cursor.
      const until = filter.until ?? Number.MAX_SAFE_INTEGER;
      const older = OLDER_MESSAGES.filter(
        (event) =>
          event.created_at <= until &&
          event.id !== filter.before_id &&
          matches(
            { kinds: [KIND_STREAM_MESSAGE], "#h": filter["#h"] } as NostrFilter,
            event,
          ),
      ).sort((a, b) => b.created_at - a.created_at);
      events.push(...older.slice(0, filter.limit ?? 30));
    } else {
      events.push(...select(filter));
    }
  }
  return events;
}

/**
 * Route `POST …/query` to the in-memory store; leave every other request to
 * the real `fetch`. Installed once, before the app mounts.
 */
function installMockQuery(): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.endsWith("/query") && (init?.method ?? "GET") === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        filters?: CursorFilter[];
      };
      return new Response(JSON.stringify(answerQuery(body.filters ?? [])), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/media/upload")) {
      return new Response("uploads are disabled in the static demo", {
        status: 403,
      });
    }
    return realFetch(input, init);
  };
}

declare global {
  interface Window {
    __NUXX_MOCK_SOCKET_FACTORY__?: RelaySocketFactory;
  }
}

/** Wire everything up. Called from `main.tsx` before the first render. */
export function enableMockRelay(): void {
  installMockQuery();
  window.__NUXX_MOCK_SOCKET_FACTORY__ = () => new MockSocket();
}
