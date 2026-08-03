/**
 * Adding, joining, and editing a community.
 *
 * A community here is a relay: its URL *is* its identity, which is why a typo in
 * one produces "cannot connect" rather than "no such community". So the two
 * things worth doing before anyone waits on a socket are normalizing the URL and
 * telling the reader what shape it has to be.
 *
 * Everything in this file is pure, so the rules can be tested without a network.
 */

/** How a community decides who gets in. */
export type JoinPolicy = "open" | "invite" | "closed";

export const JOIN_POLICY_LABELS: Record<JoinPolicy, string> = {
  open: "誰でも参加できます",
  invite: "招待が必要です",
  closed: "新しい参加を受け付けていません",
};

/** Hosted communities all live under this suffix. */
export const HOSTED_SUFFIX = ".nuxx.host";

/** What a hosted community name may contain. */
export const HOSTED_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$/;

/**
 * Normalize a relay URL a person typed.
 *
 * People paste `https://`, type a bare host, or leave a trailing slash. All three
 * mean the same relay, and treating them as different is how a reader ends up with
 * the same community listed twice.
 *
 * Bare hosts get `wss://` rather than `ws://`: an unencrypted default is the wrong
 * one to guess, and a relay that genuinely wants `ws://` can be typed in full.
 */
export function normalizeRelayUrl(input: string): string {
  let value = input.trim();
  if (!value) return "";
  value = value
    .replace(/^http:\/\//i, "ws://")
    .replace(/^https:\/\//i, "wss://");
  if (!/^wss?:\/\//i.test(value)) value = `wss://${value}`;
  // A trailing slash is not part of a WebSocket endpoint's identity.
  return value.replace(/\/+$/, "");
}

/** A message naming what is wrong with a relay URL, or null when it is usable. */
export function relayUrlError(input: string): string | null {
  const normalized = normalizeRelayUrl(input);
  if (!normalized) return "リレーのURLを入力してください。";
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return "URLとして読めませんでした。";
  }
  if (!url.hostname) return "ホスト名がありません。";
  // A relay URL with a query or a fragment is a copied browser address, not an
  // endpoint — worth saying so rather than failing at connect time.
  if (url.search || url.hash) {
    return "クエリやフラグメントは含められません。ホストまでを入力してください。";
  }
  return null;
}

/**
 * A message naming what is wrong with a hosted community name, or null.
 *
 * Case is normalized rather than refused — the name becomes a hostname label, and
 * those are case-insensitive, so rejecting `My-Team` would be pedantic. What is
 * refused is anything a label genuinely cannot contain.
 */
export function hostedNameError(name: string): string | null {
  const value = name.trim().toLowerCase();
  if (!value) return "名前を入力してください。";
  if (value.length < 3) return "3文字以上にしてください。";
  if (value.length > 32) return "32文字以内にしてください。";
  if (!HOSTED_NAME_PATTERN.test(value)) {
    return "英小文字、数字、ハイフンだけが使えます。ハイフンで始めたり終えたりはできません。";
  }
  return null;
}

/** The relay URL a hosted community of this name would have. */
export function hostedRelayUrl(name: string): string {
  return `wss://${name.trim().toLowerCase()}${HOSTED_SUFFIX}`;
}

/**
 * Whether an invite code looks like one.
 *
 * Deliberately loose: the relay decides, and a client that rejected a valid code
 * on a guessed format would be unrecoverable for the person holding it. This only
 * catches empty and obviously-not-a-code input.
 */
export function inviteCodeError(code: string): string | null {
  const value = code.trim();
  if (!value) return "招待コードを入力してください。";
  if (value.length < 4) return "招待コードが短すぎます。";
  return null;
}

/**
 * Pull an invite code out of whatever the reader pasted.
 *
 * Codes travel as links at least as often as bare strings, and asking someone to
 * edit a URL down to its last path segment is a step that exists only because the
 * client would not do it.
 */
export function extractInviteCode(input: string): string {
  const value = input.trim();
  if (!/^(https?|nuxx):\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    const fromQuery = url.searchParams.get("code");
    if (fromQuery) return fromQuery;
    const segments = url.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? value;
  } catch {
    return value;
  }
}
