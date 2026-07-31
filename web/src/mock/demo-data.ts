/**
 * Seed events for the standalone demo (GitHub Pages).
 *
 * Shapes mirror what the relay actually emits — the parsers in
 * `features/chat/chat-model.ts` and `features/chat/unread.ts` are the contract.
 * Signatures are placeholders: the client verifies nothing locally (the relay
 * does), so the demo only needs well-formed ids, not valid Schnorr.
 */

import {
  KIND_NIP29_GROUP_METADATA,
  KIND_PRESENCE_UPDATE,
  KIND_PROFILE,
  KIND_REACTION,
  KIND_STREAM_MESSAGE,
} from "@/shared/constants/kinds";
import type { NostrEvent } from "@/shared/lib/nostr-client";

/** Deterministic 64-hex id from a small label. */
function id(label: string): string {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash.toString(16).padStart(8, "0").repeat(8).slice(0, 64);
}

const SIG = "0".repeat(128);

/** Demo personas. Author labels render as truncated pubkeys. */
export const ALICE = "a11ce".padEnd(64, "a");
export const BOB = "b0b".padEnd(64, "b");
export const CAROL = "ca401".padEnd(64, "c");
export const RELAY = "fe1a".padEnd(64, "f");

export const CH_GENERAL = "11111111-1111-4111-8111-111111111111";
export const CH_DESIGN = "22222222-2222-4222-8222-222222222222";
export const CH_RANDOM = "33333333-3333-4333-8333-333333333333";
export const CH_ANNOUNCE = "44444444-4444-4444-8444-444444444444";
/** A DM, which the sidebar lists apart from the channels. */
export const CH_DM = "55555555-5555-4555-8555-555555555555";

const now = Math.floor(Date.now() / 1000);
/** Minutes ago, so the demo always looks alive regardless of when it loads. */
const ago = (minutes: number) => now - minutes * 60;

function channel(
  channelId: string,
  name: string,
  about: string,
  topic: string,
): NostrEvent {
  return {
    id: id(`chan:${channelId}`),
    pubkey: RELAY,
    kind: KIND_NIP29_GROUP_METADATA,
    created_at: ago(60 * 24),
    tags: [
      ["d", channelId],
      ["name", name],
      ["about", about],
      ["topic", topic],
      ["public"],
      ["closed"],
      ["t", "stream"],
    ],
    content: "",
    sig: SIG,
  };
}

function message(
  key: string,
  channelId: string,
  pubkey: string,
  minutesAgo: number,
  content: string,
  extraTags: string[][] = [],
): NostrEvent {
  return {
    id: id(`msg:${key}`),
    pubkey,
    kind: KIND_STREAM_MESSAGE,
    created_at: ago(minutesAgo),
    tags: [["h", channelId], ...extraTags],
    content,
    sig: SIG,
  };
}

function reaction(
  key: string,
  channelId: string,
  pubkey: string,
  minutesAgo: number,
  targetKey: string,
  emoji: string,
): NostrEvent {
  return {
    id: id(`react:${key}`),
    pubkey,
    kind: KIND_REACTION,
    created_at: ago(minutesAgo),
    tags: [
      ["h", channelId],
      ["e", id(`msg:${targetKey}`)],
    ],
    content: emoji,
    sig: SIG,
  };
}

/**
 * A DM's metadata, as the relay emits it: hidden, `t:dm`, and carrying the
 * participants as `p` tags so a client can title it without a second fetch.
 *
 * The visitor's own key is ephemeral and unknown at seed time, so the demo DM is
 * between two personas — it shows the shape of the list, and the label resolution
 * that goes with it, without pretending the visitor is in a conversation they
 * never had.
 */
function dmChannel(channelId: string, participants: string[]): NostrEvent {
  return {
    id: id(`chan:${channelId}`),
    pubkey: RELAY,
    kind: KIND_NIP29_GROUP_METADATA,
    created_at: ago(30),
    tags: [
      ["d", channelId],
      ["name", "dm"],
      ["hidden"],
      ["closed"],
      ["t", "dm"],
      ...participants.map((pubkey) => ["p", pubkey]),
    ],
    content: "",
    sig: SIG,
  };
}

export const CHANNELS: NostrEvent[] = [
  channel(CH_GENERAL, "general", "Everything else", "ship the demo"),
  channel(CH_DESIGN, "design", "Tokens, type, and taste", "rem, never px"),
  channel(CH_RANDOM, "random", "Off topic", ""),
  channel(CH_ANNOUNCE, "announcements", "Read-only-ish", "release notes"),
  dmChannel(CH_DM, [ALICE, BOB]),
];

const GENERAL_THREAD_ROOT = "gen-3";

export const MESSAGES: NostrEvent[] = [
  // --- #general: a working conversation with markdown, code, and a thread ---
  message("gen-1", CH_GENERAL, ALICE, 55, "morning! demo relay is up 🎉"),
  message(
    "gen-2",
    CH_GENERAL,
    BOB,
    52,
    "nice — this whole page is the real client talking to an in-browser mock relay. same `RelaySocket` seam the unit tests use.",
  ),
  message(
    "gen-3",
    CH_GENERAL,
    ALICE,
    48,
    "quick tour:\n\n- **channels** on the left, unread badges are live\n- messages support `inline code`, [links](https://example.com), and fenced blocks:\n\n```rust\nfn shard_of(channel: Uuid) -> u8 {\n    (channel.as_u128() % 16) as u8\n}\n```\n\nreply to this to see threads.",
  ),
  message(
    "gen-4",
    CH_GENERAL,
    CAROL,
    40,
    "threads collapse under the root, and the reply count updates live",
    [["e", id(`msg:${GENERAL_THREAD_ROOT}`), "", "reply"]],
  ),
  message(
    "gen-5",
    CH_GENERAL,
    BOB,
    38,
    "and reactions round-trip — click one",
    [["e", id(`msg:${GENERAL_THREAD_ROOT}`), "", "reply"]],
  ),
  message(
    "gen-6",
    CH_GENERAL,
    ALICE,
    12,
    "try sending a message below — it publishes kind:9 through the real session (AUTH included) and lands in the timeline.",
  ),
  // --- #design ---
  message(
    "des-1",
    CH_DESIGN,
    CAROL,
    240,
    "reminder: text sizes are rem tokens only. `text-2xs` for meta, `text-base` for chat body. the px guard fails CI otherwise.",
  ),
  message(
    "des-2",
    CH_DESIGN,
    ALICE,
    200,
    "catppuccin latte/macchiato stays 💜",
  ),
  // --- #random ---
  message("ran-1", CH_RANDOM, BOB, 400, "standup thread but it's just memes"),
  // --- a DM, to show the list apart from the channels ---
  message("dm-1", CH_DM, ALICE, 25, "got a minute to look at the shard math?"),
  message("dm-2", CH_DM, BOB, 22, "yep — sending a diff in a sec"),
  // --- #announcements: recent activity the visitor has not read → badge ---
  message(
    "ann-1",
    CH_ANNOUNCE,
    RELAY,
    8,
    "**demo build deployed.** this channel arrives unread so the sidebar badge has something true to say.",
  ),
];

export const SYSTEM_MESSAGES: NostrEvent[] = [];

export const REACTIONS: NostrEvent[] = [
  reaction("r1", CH_GENERAL, BOB, 46, GENERAL_THREAD_ROOT, "🚀"),
  reaction("r2", CH_GENERAL, CAROL, 45, GENERAL_THREAD_ROOT, "🚀"),
  reaction("r3", CH_GENERAL, ALICE, 44, "gen-2", "👍"),
];

function profile(
  pubkey: string,
  fields: { display_name: string; name: string; about?: string },
): NostrEvent {
  return {
    id: id(`profile:${pubkey}`),
    pubkey,
    kind: KIND_PROFILE,
    created_at: ago(60 * 24 * 7),
    tags: [],
    content: JSON.stringify(fields),
    sig: SIG,
  };
}

/**
 * kind:0 metadata for the demo personas.
 *
 * Deliberately without `picture`: the demo is served from GitHub Pages under a
 * strict CSP that blocks every external host, so a remote avatar would render as
 * a broken image. The initials disc is what a reader would see anyway for anyone
 * who has not set a picture.
 */
export const PROFILES: NostrEvent[] = [
  profile(ALICE, {
    display_name: "Alice Nakamura",
    name: "alice",
    about: "Relay and protocol work.",
  }),
  profile(BOB, {
    display_name: "Bob Ishikawa",
    name: "bob",
    about: "Web client.",
  }),
  profile(CAROL, {
    display_name: "Carol Tan",
    name: "carol",
    about: "Design systems.",
  }),
  profile(RELAY, { display_name: "channels.nuxx.ai", name: "relay" }),
];

export const PRESENCE: NostrEvent[] = [ALICE, BOB].map((pubkey, i) => ({
  id: id(`presence:${pubkey}`),
  pubkey,
  kind: KIND_PRESENCE_UPDATE,
  created_at: ago(1 + i),
  tags: [],
  content: JSON.stringify({ status: "online" }),
  sig: SIG,
}));

/** Channel id → last-activity seconds, from which 39007 shards are built. */
export const ACTIVITY: Record<string, number> = {
  [CH_GENERAL]: ago(12),
  [CH_DESIGN]: ago(200),
  [CH_RANDOM]: ago(400),
  [CH_ANNOUNCE]: ago(8),
  [CH_DM]: ago(22),
};

/** Older #general history, served one page at a time to exercise scrollback. */
export const OLDER_MESSAGES: NostrEvent[] = Array.from({ length: 25 }, (_, i) =>
  message(
    `gen-old-${i}`,
    CH_GENERAL,
    i % 2 === 0 ? BOB : CAROL,
    60 * 24 + i * 7,
    `older message #${25 - i} — scrollback pages these in with a composite cursor`,
  ),
);

export const SEEDED: NostrEvent[] = [
  ...PROFILES,
  ...CHANNELS,
  ...MESSAGES,
  ...SYSTEM_MESSAGES,
  ...REACTIONS,
];
