/**
 * How long things are kept, and where they live.
 *
 * Two kinds of entry here, and conflating them is the mistake to avoid. Some
 * data is kept for as long as the workspace exists — posts, files, decisions —
 * because it *is* the workspace; deleting it on a timer would be deleting the
 * product. The rest has a clock on it, and the clock is a different length for
 * each because the reasons differ: an execution log is for debugging last
 * week, an audit log is for answering a question a year later, and a cache is
 * for not recomputing something this afternoon.
 *
 * The backup window is stated rather than hidden because it is the honest
 * answer to "is it gone". Deleting from the live system is immediate; an
 * immutable backup cannot be edited to remove one row, so it ages out instead.
 * Anyone told "deleted" who then finds it in a restore has been misled, so the
 * screen says 35 days.
 */

const DAY = 24 * 3_600;

export type RetentionKey =
  | "content"
  | "file-versions"
  | "decisions"
  | "execution-logs"
  | "audit-logs"
  | "cache"
  | "trash"
  | "backup";

export interface RetentionEntry {
  key: RetentionKey;
  label: string;
  description: string;
  /** `null` means "as long as the workspace exists" rather than zero. */
  defaultSeconds: number | null;
  /** Whether a workspace may change it. */
  configurable: boolean;
}

export const RETENTION: ReadonlyArray<RetentionEntry> = [
  {
    key: "content",
    label: "投稿・成果物・Files",
    description: "この Workspace そのもの。期限で消えることはありません。",
    defaultSeconds: null,
    configurable: false,
  },
  {
    key: "file-versions",
    label: "File の旧バージョン",
    description: "上書き前の版。戻せることに意味があるので残します。",
    defaultSeconds: null,
    configurable: false,
  },
  {
    key: "decisions",
    label: "Decision・Learning・Provenance",
    description: "なぜそうしたかの記録。あとから効いてくるもの。",
    defaultSeconds: null,
    configurable: false,
  },
  {
    key: "execution-logs",
    label: "Agent／Workflow の詳細実行ログ",
    description:
      "先週の不具合を追うためのもの。量が多く、古くなると使えません。",
    defaultSeconds: 90 * DAY,
    configurable: true,
  },
  {
    key: "audit-logs",
    label: "承認・Policy・管理監査ログ",
    description: "一年後に「誰がいつ許可したか」を答えるためのもの。",
    defaultSeconds: 365 * DAY,
    configurable: true,
  },
  {
    key: "cache",
    label: "一時 Cache",
    description: "作り直せるもの。消えても失われません。",
    defaultSeconds: 7 * DAY,
    configurable: true,
  },
  {
    key: "trash",
    label: "ごみ箱",
    description: "消したあと、気が変わるまでの猶予。",
    defaultSeconds: 30 * DAY,
    configurable: true,
  },
  {
    key: "backup",
    label: "削除後のバックアップ残存",
    description:
      "変更できないバックアップは 1 行だけ消せないので、期限切れを待ちます。",
    defaultSeconds: 35 * DAY,
    configurable: false,
  },
];

export const DEFAULT_RETENTION: Record<RetentionKey, number | null> =
  Object.fromEntries(
    RETENTION.map((entry) => [entry.key, entry.defaultSeconds]),
  ) as Record<RetentionKey, number | null>;

export type RegionId = "apac" | "eu" | "us";

export interface RegionInfo {
  id: RegionId;
  label: string;
  /** Rough locale hints, for the "nearest" suggestion. */
  suggestFor: ReadonlyArray<string>;
}

export const REGIONS: ReadonlyArray<RegionInfo> = [
  { id: "apac", label: "Asia Pacific", suggestFor: ["ja", "ko", "zh", "th"] },
  { id: "eu", label: "European Union", suggestFor: ["de", "fr", "es", "it"] },
  { id: "us", label: "United States", suggestFor: ["en"] },
];

/**
 * The region to suggest, from the browser's language.
 *
 * A suggestion only — the region is chosen explicitly at workspace creation and
 * is not inferred, because where data lives is a legal question and a guess
 * from a locale is not an answer to it. Falls back to US rather than to
 * "whatever is first", so the fallback is a stated default and not an accident
 * of array order.
 */
export function suggestRegion(locale: string): RegionId {
  const language = locale.toLowerCase().split("-")[0];
  return (
    REGIONS.find((region) => region.suggestFor.includes(language))?.id ?? "us"
  );
}

/** `90日` / `1年` / `7日`, or the phrase for "kept indefinitely". */
export function formatRetention(seconds: number | null): string {
  if (seconds === null) return "Workspace 存続中";
  if (seconds % (365 * DAY) === 0) return `${seconds / (365 * DAY)}年`;
  return `${Math.round(seconds / DAY)}日`;
}

/**
 * Whether a workspace's chosen value is accepted.
 *
 * A fixed entry refuses any override. A configurable one accepts anything
 * positive: unlike the approval deadlines in §3, a longer retention is not a
 * weakening — it is the workspace choosing to keep its own records for longer,
 * which is theirs to decide.
 */
export function isValidRetentionOverride(
  entry: RetentionEntry,
  seconds: number,
): boolean {
  if (!entry.configurable) return false;
  return Number.isFinite(seconds) && seconds > 0;
}

export type Edition = "saas" | "enterprise" | "community";

export interface RecoveryTarget {
  edition: Edition;
  label: string;
  /** `null` where there is no commitment to state. */
  rpoSeconds: number | null;
  rtoSeconds: number | null;
}

export const RECOVERY_TARGETS: ReadonlyArray<RecoveryTarget> = [
  {
    edition: "saas",
    label: "Nuxx SaaS Standard",
    rpoSeconds: 15 * 60,
    rtoSeconds: 4 * 3_600,
  },
  {
    edition: "enterprise",
    label: "Enterprise",
    rpoSeconds: 5 * 60,
    rtoSeconds: 3_600,
  },
  {
    // Stated as absent rather than as a number nobody promised. A self-hosted
    // deployment's recovery time is a property of how it was set up.
    edition: "community",
    label: "Community Edition",
    rpoSeconds: null,
    rtoSeconds: null,
  },
];

/** `15分` / `4時間`, or `—` where nothing was promised. */
export function formatTarget(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds >= 3_600) return `${seconds / 3_600}時間以内`;
  return `${seconds / 60}分以内`;
}
