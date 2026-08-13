/**
 * Workspaces, their addresses, and how long a session at one lasts.
 *
 * The slug is a label, not an identity. A workspace keeps its internal id
 * through a rename, which is what makes renaming safe — every reference in the
 * database points at the id, and only the URL changes. Two rules protect the
 * URLs that were already shared: the old subdomain redirects for 90 days, and
 * the freed slug is not handed to someone else immediately. A link that
 * silently lands on a *different* organisation is worse than one that 404s.
 *
 * Sessions are host-scoped on purpose. There is no cookie on `.nuxx.ai` that
 * every workspace shares, because such a cookie is one XSS on one workspace
 * away from being every workspace's problem. Signing in happens once at the
 * account host, which then mints a single-use code that the workspace host
 * exchanges for its own session.
 */

const DAY = 24 * 3_600;

export const ACCOUNT_HOST = "app.nuxx.ai";
export const ROOT_DOMAIN = "nuxx.ai";

/** How long a freed slug keeps redirecting to its workspace's new address. */
export const SLUG_REDIRECT_SECONDS = 90 * DAY;

export interface SessionLifetimes {
  accessSeconds: number;
  refreshSeconds: number;
  absoluteSeconds: number;
  /** A refresh token is replaced every time it is used. */
  rotatesOnUse: boolean;
}

export const SESSION_LIFETIMES: SessionLifetimes = {
  accessSeconds: 15 * 60,
  refreshSeconds: 12 * 3_600,
  absoluteSeconds: 7 * DAY,
  rotatesOnUse: true,
};

export type SlugProblem =
  | "too-short"
  | "too-long"
  | "bad-characters"
  | "edge-hyphen"
  | "reserved";

export const SLUG_PROBLEM_MESSAGES: Record<SlugProblem, string> = {
  "too-short": "3 文字以上にしてください。",
  "too-long": "63 文字以内にしてください。",
  "bad-characters": "英小文字・数字・ハイフンだけが使えます。",
  "edge-hyphen": "ハイフンで始めたり終えたりはできません。",
  reserved: "この名前はシステムが使っています。",
};

/**
 * Names that cannot be a workspace, because they are already an address.
 *
 * `app` is the account host; the rest are the hostnames an operator reaches for
 * without thinking. A workspace called `www` would be reachable at a URL people
 * type by accident.
 */
const RESERVED = new Set([
  "app",
  "www",
  "api",
  "admin",
  "relay",
  "status",
  "mail",
  "static",
  "assets",
]);

/**
 * What is wrong with a slug, or `null` if nothing is.
 *
 * One problem at a time, most fundamental first, because a field that lists
 * four objections to "My Team!" is harder to act on than one that says the
 * characters are wrong.
 */
export function slugProblem(slug: string): SlugProblem | null {
  if (slug.length < 3) return "too-short";
  // The DNS label limit — this becomes a subdomain, so it is not a style rule.
  if (slug.length > 63) return "too-long";
  if (!/^[a-z0-9-]+$/.test(slug)) return "bad-characters";
  if (slug.startsWith("-") || slug.endsWith("-")) return "edge-hyphen";
  if (RESERVED.has(slug)) return "reserved";
  return null;
}

export function isValidSlug(slug: string): boolean {
  return slugProblem(slug) === null;
}

/** The address a workspace is reached at. */
export function workspaceHost(slug: string): string {
  return `${slug}.${ROOT_DOMAIN}`;
}

/**
 * Whether an old slug still points at its workspace.
 *
 * Inclusive of the boundary in the workspace's favour: a link used exactly at
 * the ninety-day mark still works.
 */
export function redirectStillActive(
  renamedAt: number,
  nowSeconds: number,
): boolean {
  return nowSeconds - renamedAt <= SLUG_REDIRECT_SECONDS;
}

/**
 * Whether a freed slug may be given to a different workspace.
 *
 * Not while it still redirects. Reassigning it earlier means a shared link
 * quietly lands on another organisation's workspace, which is a worse outcome
 * than the link being dead.
 */
export function slugAvailableForReuse(
  renamedAt: number,
  nowSeconds: number,
): boolean {
  return !redirectStillActive(renamedAt, nowSeconds);
}

/**
 * Whether a shared cookie across the root domain is permitted.
 *
 * It is not, and this is a function so the rule is testable rather than being
 * the absence of a `domain=` somewhere. One workspace's XSS must not become
 * every workspace's.
 */
export function usesSharedRootCookie(): boolean {
  return false;
}

/** `15分` / `12時間` / `7日`, in the unit the value was chosen in. */
export function formatLifetime(seconds: number): string {
  if (seconds % DAY === 0) return `${seconds / DAY}日`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}時間`;
  return `${seconds / 60}分`;
}
