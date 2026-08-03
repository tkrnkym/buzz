/**
 * Unsent message text, kept per composer.
 *
 * Local to the browser, deliberately. A draft is not a message: publishing it to
 * the relay would put half-written text — the thing people most expect to be
 * private — into an event store that other clients read, and every keystroke
 * would be a network write. So this is `localStorage`, scoped to the signing
 * key so two identities on one machine do not read each other's unsent text.
 *
 * A thread's draft is separate from its channel's. The composer aims at one or
 * the other, and merging them would make a half-written reply reappear in the
 * room — which is exactly the mistake the thread panel exists to prevent.
 */

const PREFIX = "nuxx-drafts.v1";

/** Where one composer's text lives. */
export interface DraftKey {
  channelId: string;
  /** The thread root when the composer is aimed at a thread, else null. */
  threadRootId?: string | null;
}

/**
 * How long an untouched draft survives.
 *
 * Text abandoned a month ago is not a draft any more — restoring it puts words
 * in someone's mouth they no longer remember writing.
 */
export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface StoredDraft {
  text: string;
  /** When it was last edited, for the TTL sweep. */
  at: number;
}

type DraftStore = Record<string, StoredDraft>;

/** Storage key for one identity. Anonymous readers get their own slot. */
export function storageKey(pubkey: string | null): string {
  return `${PREFIX}:${pubkey ?? "anonymous"}`;
}

/** Composer identity within a store. */
export function draftKey({ channelId, threadRootId }: DraftKey): string {
  return threadRootId ? `${channelId}/${threadRootId}` : channelId;
}

function parse(raw: string | null): DraftStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const store: DraftStore = {};
    for (const [key, value] of Object.entries(parsed as DraftStore)) {
      // Tolerate anything: this is data a previous version wrote, and a single
      // malformed entry must not lose every other draft.
      if (
        value &&
        typeof value === "object" &&
        typeof value.text === "string" &&
        typeof value.at === "number"
      ) {
        store[key] = { text: value.text, at: value.at };
      }
    }
    return store;
  } catch {
    return {};
  }
}

/** Drop entries past the TTL. Returns the store and whether anything changed. */
export function sweep(
  store: DraftStore,
  now: number,
): { store: DraftStore; changed: boolean } {
  const kept: DraftStore = {};
  let changed = false;
  for (const [key, draft] of Object.entries(store)) {
    if (now - draft.at > DRAFT_TTL_MS) {
      changed = true;
      continue;
    }
    kept[key] = draft;
  }
  return { store: kept, changed };
}

/**
 * Read the draft for one composer.
 *
 * Returns `""` rather than null for a missing draft: every caller wants a string
 * to put in a text field, and "no draft" and "an empty draft" are the same
 * thing to a reader looking at an empty box.
 */
export function readDraft(
  storage: Storage,
  pubkey: string | null,
  key: DraftKey,
  now: number,
): string {
  const store = parse(storage.getItem(storageKey(pubkey)));
  const draft = store[draftKey(key)];
  if (!draft) return "";
  if (now - draft.at > DRAFT_TTL_MS) return "";
  return draft.text;
}

/**
 * Write (or clear) the draft for one composer.
 *
 * Empty text removes the entry rather than storing a blank, so a reader who
 * clears a box does not leave a tombstone behind that the sweep has to age out.
 */
export function writeDraft(
  storage: Storage,
  pubkey: string | null,
  key: DraftKey,
  text: string,
  now: number,
): void {
  const slot = storageKey(pubkey);
  const { store } = sweep(parse(storage.getItem(slot)), now);
  const entry = draftKey(key);

  if (text.trim().length === 0) {
    if (!(entry in store)) return;
    delete store[entry];
  } else {
    store[entry] = { text, at: now };
  }

  try {
    if (Object.keys(store).length === 0) {
      storage.removeItem(slot);
      return;
    }
    storage.setItem(slot, JSON.stringify(store));
  } catch {
    // A full or unavailable storage costs the draft, not the message the reader
    // is in the middle of writing — which is still in the composer's state.
  }
}

/** Composer keys that currently hold text, for the sidebar's draft marker. */
export function draftKeys(
  storage: Storage,
  pubkey: string | null,
  now: number,
): string[] {
  const { store } = sweep(parse(storage.getItem(storageKey(pubkey))), now);
  return Object.keys(store);
}
