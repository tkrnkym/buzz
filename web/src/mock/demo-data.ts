/**
 * Seed events for the standalone demo (GitHub Pages).
 *
 * Shapes mirror what the relay actually emits — the parsers in
 * `features/chat/chat-model.ts`, `features/chat/timeline.ts`, and
 * `features/chat/unread.ts` are the contract. Signatures are placeholders: the
 * client verifies nothing locally (the relay does), so the demo only needs
 * well-formed ids, not valid Schnorr.
 *
 * The conversation is Japanese because the product is. It is also written to put
 * every rendering rule on screen without saying so: an author burst that groups,
 * a thread with a real back-and-forth, an edit, a tombstone, a run of join
 * notices, yesterday's messages so a second day divider appears, and a DM.
 */

import {
  KIND_EMOJI_SET,
  KIND_NIP29_DELETE_EVENT,
  KIND_NIP29_GROUP_MEMBERS,
  KIND_NIP29_GROUP_METADATA,
  KIND_PRESENCE_UPDATE,
  KIND_PROFILE,
  KIND_REACTION,
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_EDIT,
  KIND_SYSTEM_MESSAGE,
} from "@/shared/constants/kinds";
import type { NostrEvent } from "@/shared/lib/nostr-client";

/** Deterministic 64-hex id from a small label. */
function id(label: string): string {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash.toString(16).padStart(8, "0").repeat(8).slice(0, 64);
}

const SIG = "0".repeat(128);

/** Demo personas. Names come from their kind:0 profiles, below. */
export const MISAKI = "a11ce".padEnd(64, "a");
export const KEN = "b0b".padEnd(64, "b");
export const AYA = "ca401".padEnd(64, "c");
export const RELAY = "fe1a".padEnd(64, "f");

/**
 * Agent identities.
 *
 * Declared here with the people because they are people as far as the protocol
 * is concerned: an agent signs its own events with its own key and publishes a
 * kind:0 like anyone else. Keeping them in one list is what makes a name
 * resolve the same way wherever it appears.
 */
export const AGENT_REVIEWER = "d00d".padEnd(64, "d");
export const AGENT_RELEASE = "e11e".padEnd(64, "e");
export const AGENT_TRIAGE = "0a11".padEnd(64, "0");

export const CH_GENERAL = "11111111-1111-4111-8111-111111111111";
export const CH_DEV = "22222222-2222-4222-8222-222222222222";
export const CH_DESIGN = "33333333-3333-4333-8333-333333333333";
export const CH_RANDOM = "44444444-4444-4444-8444-444444444444";
export const CH_ANNOUNCE = "66666666-6666-4666-8666-666666666666";
/** A DM, which the sidebar lists apart from the channels. */
export const CH_DM = "55555555-5555-4555-8555-555555555555";

const now = Math.floor(Date.now() / 1000);
/** Minutes ago, so the demo always looks alive regardless of when it loads. */
const ago = (minutes: number) => now - minutes * 60;
/**
 * Yesterday at a fixed hour, so the day divider is always a real boundary.
 *
 * "26 hours ago" would land on today whenever the page is opened after 2am, and
 * the divider it is there to demonstrate would silently disappear.
 */
function yesterdayAt(hour: number, minute: number): number {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(hour, minute, 0, 0);
  return Math.floor(date.getTime() / 1_000);
}

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
    created_at: ago(60 * 24 * 30),
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

/**
 * A DM's metadata, as the relay emits it: hidden, `t:dm`, and carrying the
 * participants as `p` tags so a client can title it without a second fetch.
 *
 * The visitor's own key is ephemeral and unknown at seed time, so the demo DM is
 * between two personas — it shows the shape of the list, and the label
 * resolution that goes with it, without pretending the visitor is in a
 * conversation they never had.
 */
function dmChannel(channelId: string, participants: string[]): NostrEvent {
  return {
    id: id(`chan:${channelId}`),
    pubkey: RELAY,
    kind: KIND_NIP29_GROUP_METADATA,
    created_at: ago(60 * 24 * 3),
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

function event(
  key: string,
  kind: number,
  pubkey: string,
  at: number,
  content: string,
  tags: string[][],
): NostrEvent {
  return { id: id(key), pubkey, kind, created_at: at, tags, content, sig: SIG };
}

function message(
  key: string,
  channelId: string,
  pubkey: string,
  at: number,
  content: string,
  extraTags: string[][] = [],
): NostrEvent {
  return event(`msg:${key}`, KIND_STREAM_MESSAGE, pubkey, at, content, [
    ["h", channelId],
    ...extraTags,
  ]);
}

/** A threaded reply. Root and parent collapse to one tag when they are equal. */
function reply(
  key: string,
  channelId: string,
  pubkey: string,
  at: number,
  rootKey: string,
  content: string,
): NostrEvent {
  return message(key, channelId, pubkey, at, content, [
    ["e", id(`msg:${rootKey}`), "", "reply"],
  ]);
}

/**
 * A reaction, without an `h` tag — matching `nuxx-sdk::build_reaction` and the
 * client's own `buildReactionTemplate`.
 *
 * That absence is the whole reason the client fetches reactions by `#e` against
 * the message ids on screen: a channel-scoped subscription cannot see them. A
 * fixture that added `h` would let a broken client pass here.
 */
function reaction(
  key: string,
  pubkey: string,
  at: number,
  targetKey: string,
  emoji: string,
): NostrEvent {
  return event(`react:${key}`, KIND_REACTION, pubkey, at, emoji, [
    ["e", id(`msg:${targetKey}`)],
  ]);
}

/** An edit: a separate event pointing at the original, never a rewrite of it. */
function edit(
  key: string,
  channelId: string,
  pubkey: string,
  at: number,
  targetKey: string,
  content: string,
): NostrEvent {
  return event(`edit:${key}`, KIND_STREAM_MESSAGE_EDIT, pubkey, at, content, [
    ["h", channelId],
    ["e", id(`msg:${targetKey}`)],
  ]);
}

/** A tombstone. Kind 9005 carries the channel, so subscribers see the removal. */
function tombstone(
  key: string,
  channelId: string,
  pubkey: string,
  at: number,
  targetKey: string,
  publicReason?: string,
): NostrEvent {
  return event(`del:${key}`, KIND_NIP29_DELETE_EVENT, pubkey, at, "", [
    ["h", channelId],
    ["e", id(`msg:${targetKey}`)],
    ...(publicReason ? [["public_reason", publicReason]] : []),
  ]);
}

function systemMessage(
  key: string,
  channelId: string,
  at: number,
  payload: Record<string, string>,
): NostrEvent {
  return event(
    `sys:${key}`,
    KIND_SYSTEM_MESSAGE,
    RELAY,
    at,
    JSON.stringify(payload),
    [["h", channelId]],
  );
}

/**
 * NIP-30 custom emoji for the demo.
 *
 * Inline SVG data URIs rather than hosted images: the demo is served under a
 * policy that blocks every external host, so a remote picture would render as a
 * broken image — and the point here is to show that a shortcode resolves, not to
 * ship artwork.
 *
 * Published by the personas themselves, because that is the actual data model:
 * there is no server-side registry, and the palette a reader sees is the union
 * of everyone's sets.
 */
function emojiSet(pubkey: string, entries: [string, string][]): NostrEvent {
  return event(
    `emoji:${pubkey}`,
    KIND_EMOJI_SET,
    pubkey,
    ago(60 * 24 * 20),
    "",
    [["d", "nuxx"], ...entries.map(([code, url]) => ["emoji", code, url])],
  );
}

/**
 * Same-origin URLs, absolutized.
 *
 * A `data:` URI would be simpler, but react-markdown's `defaultUrlTransform`
 * blanks any scheme outside http/https/mailto before a renderer sees it — the
 * right default for user content, and one a real emoji URL (a Blossom
 * `https://…`) already satisfies. Served from `public/` rather than imported, so
 * Vite cannot inline a small SVG into the very `data:` URI this avoids.
 */
const emojiUrl = (file: string) =>
  new URL(`${import.meta.env.BASE_URL}demo-emoji/${file}`, window.location.href)
    .href;

const SHIPIT_URL = emojiUrl("shipit.svg");
const LGTM_URL = emojiUrl("lgtm.svg");

export const EMOJI_SETS: NostrEvent[] = [
  emojiSet(KEN, [["shipit", SHIPIT_URL]]),
  emojiSet(AYA, [["lgtm", LGTM_URL]]),
];

export const CHANNELS: NostrEvent[] = [
  channel(CH_GENERAL, "general", "全体連絡と雑多な相談", "今週は金曜リリース"),
  channel(CH_DEV, "dev", "実装の相談", "relay と web"),
  channel(CH_DESIGN, "design", "デザインシステム", "文字サイズは rem のみ"),
  channel(CH_RANDOM, "random", "雑談", ""),
  channel(CH_ANNOUNCE, "announcements", "お知らせ", "リリースノート"),
  dmChannel(CH_DM, [MISAKI, KEN]),
];

/**
 * A channel's member list, as NIP-29 kind:39002 — keyed by the channel id in `d`
 * and carrying the role in the fourth slot of each `p` tag.
 *
 * These are what the mention autocomplete and the DM picker read: the client has
 * no user-search endpoint, so who a reader can address is exactly who shares a
 * channel with them.
 */
function memberList(
  channelId: string,
  members: [pubkey: string, role: string][],
): NostrEvent {
  return event(
    `members:${channelId}`,
    KIND_NIP29_GROUP_MEMBERS,
    RELAY,
    ago(60 * 24 * 30),
    "",
    [
      ["d", channelId],
      ...members.map(([pubkey, role]) => ["p", pubkey, "", role]),
    ],
  );
}

export const MEMBER_LISTS: NostrEvent[] = [
  memberList(CH_GENERAL, [
    [MISAKI, "owner"],
    [KEN, "admin"],
    [AYA, "member"],
  ]),
  memberList(CH_DEV, [
    [MISAKI, "admin"],
    [KEN, "member"],
  ]),
  memberList(CH_DESIGN, [
    [AYA, "admin"],
    [MISAKI, "member"],
  ]),
  memberList(CH_RANDOM, [
    [KEN, "member"],
    [AYA, "member"],
  ]),
  memberList(CH_ANNOUNCE, [
    [MISAKI, "owner"],
    [RELAY, "admin"],
  ]),
];

/** The thread root in #general, replied to three times. */
const THREAD_ROOT = "gen-4";

export const MESSAGES: NostrEvent[] = [
  // --- #general, yesterday: enough to put a real day boundary on screen ---
  message(
    "gen-y1",
    CH_GENERAL,
    MISAKI,
    yesterdayAt(17, 42),
    "リリース日、金曜の午前で確定しました。詳細はあとで #announcements に流します",
  ),
  message(
    "gen-y2",
    CH_GENERAL,
    KEN,
    yesterdayAt(17, 48),
    "承知しました。web 側の残りは明日まとめます",
  ),

  // --- #general, today ---
  message("gen-1", CH_GENERAL, MISAKI, ago(182), "おはようございます 🌤"),
  // Same author, six minutes later: renders as a continuation — no avatar, no
  // repeated name, just a hover-revealed time.
  message(
    "gen-2",
    CH_GENERAL,
    MISAKI,
    ago(176),
    "昨日の件、リリースブランチを切りました。`release/0.4` です",
  ),
  // A mention: the `@田中 健` in the body is what every client renders, and the
  // `p` tag is what actually notifies him. The chip only appears because his
  // kind:0 name is known — an unresolved `@name` stays plain text.
  message(
    "gen-3",
    CH_GENERAL,
    MISAKI,
    ago(174),
    "@田中 健 取り込み漏れがあったら今日中に教えてください",
    [["p", KEN]],
  ),
  message(
    "gen-4",
    CH_GENERAL,
    KEN,
    ago(150),
    "web の残タスクです。ここにぶら下げていきます\n\n- 未読ラインの初期表示\n- スレッドパネルの幅\n- 設定画面の文言",
  ),
  reply(
    "gen-5",
    CH_GENERAL,
    AYA,
    ago(142),
    THREAD_ROOT,
    "文言はこちらで見ます。敬体で統一しますね",
  ),
  reply(
    "gen-6",
    CH_GENERAL,
    KEN,
    ago(138),
    THREAD_ROOT,
    "助かります 🙏 未読ラインは直しました",
  ),
  reply(
    "gen-7",
    CH_GENERAL,
    MISAKI,
    ago(120),
    THREAD_ROOT,
    "幅は 24rem で様子見にしましょう。狭かったら next で調整で",
  ),
  message(
    "gen-8",
    CH_GENERAL,
    AYA,
    ago(96),
    "デザイン側は完了しています。トークンは [DESIGN-SYSTEM.md](https://example.com/design-system) にまとめました",
  ),
  message(
    "gen-9",
    CH_GENERAL,
    KEN,
    ago(64),
    "シャードの計算、これで合ってますか？\n\n```rust\nfn shard_of(channel: Uuid) -> u8 {\n    (channel.as_u128() % 16) as u8\n}\n```",
  ),
  // Edited below, which is what puts "(edited)" on the row.
  message(
    "gen-10",
    CH_GENERAL,
    MISAKI,
    ago(58),
    "合っています。`% 16` は SHARD_COUNT と揃えてあります",
  ),
  // Deleted below, which is what puts a tombstone on the row.
  message("gen-11", CH_GENERAL, KEN, ago(40), "（宛先を間違えました）"),
  message(
    "gen-12",
    CH_GENERAL,
    MISAKI,
    ago(9),
    "下の入力欄から送ってみてください。実際に kind:9 が publish されて、そのままタイムラインに載ります",
  ),

  // --- #dev ---
  message(
    "dev-1",
    CH_DEV,
    KEN,
    ago(300),
    "リアクションって `h` タグ持ってないんですね。チャンネル購読だけだと拾えなくて詰まりました",
  ),
  message(
    "dev-2",
    CH_DEV,
    MISAKI,
    ago(296),
    "そうです。kind:7 と kind:5 は `e` しか持たないので、画面に出ているメッセージ ID に対して `#e` で別途引く必要があります",
  ),
  message(
    "dev-3",
    CH_DEV,
    KEN,
    ago(292),
    "なるほど、それで二重に購読してるのか",
  ),
  // A custom emoji, with its definition on the event — that is what NIP-30
  // requires, and what lets a client that has never seen Ken's set render it.
  message("dev-4", CH_DEV, KEN, ago(288), "直したのでマージします :shipit:", [
    ["emoji", "shipit", SHIPIT_URL],
  ]),
  message("dev-5", CH_DEV, AYA, ago(284), ":lgtm: 確認しました", [
    ["emoji", "lgtm", LGTM_URL],
  ]),

  // --- #design ---
  message(
    "des-1",
    CH_DESIGN,
    AYA,
    ago(1_100),
    "文字サイズは rem トークンのみでお願いします。px 直書きはブラウザのズームに追従しないので、CI のガードで落ちます",
  ),
  message(
    "des-2",
    CH_DESIGN,
    AYA,
    ago(1_096),
    "本文は `text-base`、時刻やバッジは `text-2xs` です",
  ),
  message(
    "des-3",
    CH_DESIGN,
    MISAKI,
    ago(1_050),
    "配色は Catppuccin のまま（Latte / Macchiato）で続けます 💜",
  ),

  // --- #random ---
  message(
    "ran-1",
    CH_RANDOM,
    KEN,
    ago(1_400),
    "近所にできたコーヒー屋、めちゃくちゃ良かったです",
  ),
  message("ran-2", CH_RANDOM, AYA, ago(1_380), "場所どこですか 👀"),

  // --- the DM ---
  message(
    "dm-1",
    CH_DM,
    MISAKI,
    ago(28),
    "シャードの件、あとで 10 分だけ見てもらえますか",
  ),
  message("dm-2", CH_DM, KEN, ago(24), "大丈夫です。差分そのまま貼りますね"),

  // --- #announcements: recent, so the sidebar badge has something true to say ---
  message(
    "ann-1",
    CH_ANNOUNCE,
    RELAY,
    ago(6),
    "**0.4 をデプロイしました。** 変更点はリリースノートをご覧ください。不具合があれば #dev までお願いします",
  ),
];

/**
 * Relay-authored notices.
 *
 * Three joins within a few minutes of each other, which is what makes them
 * collapse into one block instead of pushing the conversation off the screen —
 * see `timeline-items`.
 */
export const SYSTEM_MESSAGES: NostrEvent[] = [
  systemMessage("s1", CH_GENERAL, ago(170), {
    type: "member_joined",
    actor: MISAKI,
    target: KEN,
  }),
  systemMessage("s2", CH_GENERAL, ago(169), {
    type: "member_joined",
    actor: MISAKI,
    target: AYA,
  }),
  systemMessage("s3", CH_GENERAL, ago(168), {
    type: "topic_changed",
    actor: MISAKI,
    topic: "今週は金曜リリース",
  }),
];

export const REACTIONS: NostrEvent[] = [
  reaction("r1", KEN, ago(148), THREAD_ROOT, "👀"),
  reaction("r2", AYA, ago(146), THREAD_ROOT, "👍"),
  reaction("r3", MISAKI, ago(94), "gen-8", "🎉"),
  reaction("r4", KEN, ago(92), "gen-8", "🎉"),
  reaction("r5", AYA, ago(56), "gen-10", "🙏"),
];

/** Overlays: an edit and a tombstone, both applied by `deriveTimeline`. */
export const OVERLAYS: NostrEvent[] = [
  edit(
    "e1",
    CH_GENERAL,
    MISAKI,
    ago(55),
    "gen-10",
    "合っています。`% 16` は `SHARD_COUNT` と揃えてあるので、そちらを変えたらこっちも変わります",
  ),
  tombstone("d1", CH_GENERAL, KEN, ago(38), "gen-11"),
];

function profile(
  pubkey: string,
  fields: { display_name: string; name: string; about?: string },
): NostrEvent {
  return event(
    `profile:${pubkey}`,
    KIND_PROFILE,
    pubkey,
    ago(60 * 24 * 30),
    JSON.stringify(fields),
    [],
  );
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
  profile(MISAKI, {
    display_name: "佐藤 美咲",
    name: "misaki",
    about: "リレーとプロトコルまわり",
  }),
  profile(KEN, {
    display_name: "田中 健",
    name: "ken",
    about: "web クライアント",
  }),
  profile(AYA, {
    display_name: "鈴木 彩",
    name: "aya",
    about: "デザインシステム",
  }),
  profile(RELAY, { display_name: "channels.nuxx.ai", name: "relay" }),
  profile(AGENT_REVIEWER, {
    display_name: "レビュー係",
    name: "reviewer",
    about: "PR を読んで、危ないところだけ指摘します",
  }),
  profile(AGENT_RELEASE, {
    display_name: "リリース番",
    name: "releaser",
    about: "タグを切って、リリースノートの下書きを置きます",
  }),
  profile(AGENT_TRIAGE, {
    display_name: "トリアージ",
    name: "triage",
    about: "新しい Issue にラベルを付けます",
  }),
];

export const PRESENCE: NostrEvent[] = [MISAKI, KEN].map((pubkey, index) =>
  event(
    `presence:${pubkey}`,
    KIND_PRESENCE_UPDATE,
    pubkey,
    ago(1 + index),
    "online",
    [["status", "online"]],
  ),
);

/** Channel id → last-activity seconds, from which 39007 shards are built. */
export const ACTIVITY: Record<string, number> = {
  [CH_GENERAL]: ago(9),
  [CH_DEV]: ago(292),
  [CH_DESIGN]: ago(1_050),
  [CH_RANDOM]: ago(1_380),
  [CH_ANNOUNCE]: ago(6),
  [CH_DM]: ago(24),
};

/**
 * Older #general history, served one page at a time to exercise scrollback.
 *
 * Spread across earlier days so paging in also brings in day dividers, which is
 * the case most likely to be wrong: a divider inserted above the reader's
 * position is exactly what the scroll anchoring has to survive.
 */
const OLD_LINES = [
  "スレッドの未読、いったん保留にします",
  "週次の議事録あげました",
  "CI が落ちてたのは flaky でした。再実行で通っています",
  "リレーの再起動、20 時にやります",
  "検索の kinds 指定、忘れると 403 になるので注意です",
  "メディアのアップロード上限、いまは 25MB です",
  "招待リンクの有効期限を 7 日に変えました",
  "タイムゾーン、表示はローカルのままでいきます",
];

export const OLDER_MESSAGES: NostrEvent[] = Array.from(
  { length: 24 },
  (_, index) =>
    message(
      `gen-old-${index}`,
      CH_GENERAL,
      index % 2 === 0 ? KEN : AYA,
      // Walk backwards from two days ago, a few hours at a time.
      ago(60 * 24 * 2 + index * 190),
      OLD_LINES[index % OLD_LINES.length],
    ),
);

export const SEEDED: NostrEvent[] = [
  ...PROFILES,
  ...CHANNELS,
  ...MEMBER_LISTS,
  ...EMOJI_SETS,
  ...MESSAGES,
  ...SYSTEM_MESSAGES,
  ...REACTIONS,
  ...OVERLAYS,
];

/**
 * Moderation rows for the demo's `/moderation/*` endpoints.
 *
 * Fixtures for three reads the relay derives from its own state rather than from
 * events, so there is nothing in the event store that could stand in for them —
 * see `moderation-api.ts` for why they are HTTP.
 *
 * Deliberately unglamorous: one open spam report, one member serving a timeout,
 * and an audit trail short enough to read. A queue seeded with a dozen lurid
 * reports would demo the list widget and misrepresent the product.
 */
export const MODERATION_REPORTS = [
  {
    id: "rep-1",
    reportEventId: "1".repeat(64),
    reporterPubkey: AYA,
    targetKind: "pubkey" as const,
    target: KEN,
    channelId: CH_RANDOM,
    reportType: "spam",
    note: "同じリンクを短時間に何度も貼っています。",
    status: "open",
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date(ago(95) * 1000).toISOString(),
  },
  {
    id: "rep-2",
    reportEventId: "2".repeat(64),
    reporterPubkey: KEN,
    targetKind: "event" as const,
    target: "3".repeat(64),
    channelId: CH_GENERAL,
    reportType: "other",
    note: null,
    status: "open",
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date(ago(400) * 1000).toISOString(),
  },
];

export const MODERATION_RESTRICTED = [
  {
    pubkey: AYA,
    banned: false,
    banExpiresAt: null,
    banReason: null,
    // Still running, so the demo shows the lift control rather than an empty list.
    mutedUntil: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    muteReason: "議論が白熱したため",
    actorPubkey: MISAKI,
    updatedAt: new Date(ago(180) * 1000).toISOString(),
  },
];

export const MODERATION_AUDIT = [
  {
    id: "act-1",
    actorPubkey: MISAKI,
    action: "timeout",
    targetPubkey: AYA,
    targetEventId: null,
    channelId: CH_GENERAL,
    reasonCode: null,
    publicReason: "議論が白熱したため",
    createdAt: new Date(ago(180) * 1000).toISOString(),
  },
  {
    id: "act-2",
    actorPubkey: MISAKI,
    action: "resolve_report",
    targetPubkey: null,
    targetEventId: "4".repeat(64),
    channelId: CH_DEV,
    reasonCode: "duplicate",
    publicReason: null,
    createdAt: new Date(ago(1500) * 1000).toISOString(),
  },
];
