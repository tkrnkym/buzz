/**
 * Custom emoji (NIP-30), and the workspace palette built from them.
 *
 * There is no server-side emoji registry. Each member publishes their own
 * kind:30030 set — signed as themselves, keyed by `(pubkey, d)` — and a
 * kind:10030 list saying which sets and single emoji they use. The palette a
 * reader sees is the *union* of those, computed on read.
 *
 * That is a deliberate consequence of the data model rather than a limitation to
 * work around: nobody owns the emoji namespace, so two people can define
 * `:shipit:` differently and both are valid. This module resolves that
 * collision by one stated rule — the reader's own definition wins, then the
 * oldest — so a shortcode does not change meaning as events arrive in a
 * different order.
 */

import { KIND_EMOJI_LIST, KIND_EMOJI_SET } from "@/shared/constants/kinds";
import type { NostrEvent, NostrFilter } from "@/shared/lib/nostr-client";
import { normalizePubkey } from "@/features/profile/profile-model";

export interface CustomEmoji {
  /** Bare shortcode, without the surrounding colons. */
  shortcode: string;
  url: string;
  /** Who published the set this came from. */
  author: string;
  /** The set's `d` tag, or `null` for a loose kind:10030 entry. */
  pack: string | null;
}

/** Shortcode → the emoji that shortcode resolves to for this reader. */
export type EmojiCatalog = Record<string, CustomEmoji>;

/**
 * A shortcode is `a-z`, `0-9` and `_`.
 *
 * Narrow on purpose: the renderer scans message text for `:word:`, and a
 * permissive pattern would turn ordinary punctuation — a time, a ratio, a URL's
 * `https://` — into a candidate on every keystroke.
 */
const SHORTCODE = /^[a-z0-9_]+$/;

/** Whether a tag value can be used as a shortcode at all. */
export function isShortcode(value: string): boolean {
  return SHORTCODE.test(value);
}

/**
 * Filters for the emoji published by a set of people.
 *
 * Both kinds in one filter: they are read together and neither is useful alone —
 * a set nobody lists is still usable, and a list pointing at no set still
 * carries its own inline entries.
 */
export function buildEmojiFilters(pubkeys: string[]): NostrFilter[] {
  const authors = [...new Set(pubkeys.map(normalizePubkey))].filter(Boolean);
  if (authors.length === 0) return [];
  return [{ kinds: [KIND_EMOJI_LIST, KIND_EMOJI_SET], authors }];
}

/** The emoji defined by one kind:10030 or kind:30030 event. */
export function emojiFromEvent(event: NostrEvent): CustomEmoji[] {
  if (event.kind !== KIND_EMOJI_LIST && event.kind !== KIND_EMOJI_SET) {
    return [];
  }
  const pack =
    event.kind === KIND_EMOJI_SET
      ? (event.tags.find((tag) => tag[0] === "d")?.[1] ?? null)
      : null;
  const author = normalizePubkey(event.pubkey);
  const emoji: CustomEmoji[] = [];

  for (const tag of event.tags) {
    // NIP-30: ["emoji", shortcode, url].
    if (tag[0] !== "emoji") continue;
    const shortcode = (tag[1] ?? "").toLowerCase();
    const url = tag[2] ?? "";
    // A shortcode without a URL renders as nothing; dropping it here keeps the
    // catalog to entries the picker can actually show.
    if (!isShortcode(shortcode) || !url) continue;
    emoji.push({ shortcode, url, author, pack });
  }
  return emoji;
}

/**
 * The reader's palette: the union of everyone's emoji.
 *
 * Collisions resolve to the reader's own definition first, then to the oldest
 * event. "Oldest" rather than "newest" because a shortcode that silently
 * re-points when someone publishes a set is a shortcode that means something
 * different in yesterday's messages than it did yesterday.
 */
export function buildEmojiCatalog({
  events,
  selfPubkey,
}: {
  events: NostrEvent[];
  selfPubkey?: string | null;
}): EmojiCatalog {
  const self = selfPubkey ? normalizePubkey(selfPubkey) : null;
  const catalog: EmojiCatalog = {};
  const claimedAt: Record<string, number> = {};
  const claimedBySelf: Record<string, boolean> = {};

  for (const event of events) {
    for (const emoji of emojiFromEvent(event)) {
      const mine = emoji.author === self;
      const held = catalog[emoji.shortcode];
      if (held) {
        if (claimedBySelf[emoji.shortcode] && !mine) continue;
        if (
          claimedBySelf[emoji.shortcode] === mine &&
          claimedAt[emoji.shortcode] <= event.created_at
        ) {
          continue;
        }
      }
      catalog[emoji.shortcode] = emoji;
      claimedAt[emoji.shortcode] = event.created_at;
      claimedBySelf[emoji.shortcode] = mine;
    }
  }

  return catalog;
}

/** Catalog entries matching a query, shortcode-prefix first. */
export function searchEmoji(
  catalog: EmojiCatalog,
  query: string,
  limit = 24,
): CustomEmoji[] {
  const needle = query.trim().toLowerCase().replace(/^:/, "");
  const entries = Object.values(catalog);
  if (!needle) {
    return entries
      .sort((left, right) => left.shortcode.localeCompare(right.shortcode))
      .slice(0, limit);
  }

  return entries
    .filter((emoji) => emoji.shortcode.includes(needle))
    .sort((left, right) => {
      const leftPrefix = left.shortcode.startsWith(needle) ? 0 : 1;
      const rightPrefix = right.shortcode.startsWith(needle) ? 0 : 1;
      return (
        leftPrefix - rightPrefix ||
        left.shortcode.localeCompare(right.shortcode)
      );
    })
    .slice(0, limit);
}

/**
 * The `emoji` tag a message or reaction carries for the shortcodes it uses.
 *
 * NIP-30 requires the definition to travel with the event: a client that has
 * never seen the author's set still has to render `:shipit:`. Only shortcodes
 * actually present in the content are tagged — a tag for an unused emoji is
 * noise the reader's client would have to fetch and then discard.
 */
export function emojiTagsForContent(
  content: string,
  catalog: EmojiCatalog,
): string[][] {
  const tags: string[][] = [];
  for (const shortcode of new Set(shortcodesIn(content))) {
    const emoji = catalog[shortcode];
    if (emoji) tags.push(["emoji", emoji.shortcode, emoji.url]);
  }
  return tags;
}

/** Shortcodes written as `:name:` in text, in order of appearance. */
export function shortcodesIn(content: string): string[] {
  const found: string[] = [];
  const pattern = /:([a-z0-9_]+):/g;
  let match = pattern.exec(content);
  while (match) {
    found.push(match[1]);
    match = pattern.exec(content);
  }
  return found;
}

/**
 * The `:name:` token being typed at the caret, or `null`.
 *
 * Same word-boundary rule as a mention: a colon in the middle of a word — a URL
 * scheme, a time — is not the start of an emoji.
 */
export function activeEmojiQuery(
  text: string,
  caret: number,
): { query: string; from: number } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf(":");
  if (at === -1) return null;

  const preceding = at === 0 ? "" : before[at - 1];
  if (preceding && !/\s/.test(preceding)) return null;

  const query = before.slice(at + 1);
  // Two characters before offering completions: `:` alone appears in ordinary
  // prose often enough that opening a picker on it would fight the writer.
  if (query.length < 2 || !isShortcode(query)) return null;

  return { query, from: at };
}

/** Replace the `:name` token at `from` with a completed `:shortcode:`. */
export function applyEmoji(
  text: string,
  from: number,
  caret: number,
  shortcode: string,
): { text: string; caret: number } {
  const inserted = `:${shortcode}: `;
  return {
    text: text.slice(0, from) + inserted + text.slice(caret),
    caret: from + inserted.length,
  };
}

/**
 * The reader's own emoji set, as a kind:30030 event template.
 *
 * One set per reader under a fixed `d`, because this client offers no notion of
 * named packs to manage — adding an emoji is adding it to "mine". A client that
 * curated several would use a different `d` per pack; the parser above already
 * reads them.
 */
export const MY_EMOJI_SET_D_TAG = "nuxx";

export function buildEmojiSetTemplate(emoji: CustomEmoji[]): {
  kind: number;
  tags: string[][];
  content: string;
} {
  return {
    kind: KIND_EMOJI_SET,
    tags: [
      ["d", MY_EMOJI_SET_D_TAG],
      ...emoji.map((entry) => ["emoji", entry.shortcode, entry.url]),
    ],
    content: "",
  };
}
