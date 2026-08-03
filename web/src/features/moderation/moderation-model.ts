/**
 * Community moderation: reports, bans, timeouts, and the reader's own mute list.
 *
 * Two very different things live here, and the split is the point.
 *
 * A **moderation command** (9040–9044) is a request to the relay, signed by a
 * moderator. The relay validates the actor's role, applies the change, and
 * records it — so nothing here is state, and there is no optimistic update to
 * reconcile. None of these events carries an `h` tag: the community is bound
 * from the connection host, and a channel-scoped ban is rejected rather than
 * quietly narrowed to one room.
 *
 * A **mute** (kind 10000) is the reader's own list. It asks nothing of the relay
 * and tells nobody, which is why an ordinary member can use it and a moderator
 * action is not a substitute for it.
 *
 * The reactive half — learning that *you* are timed out — is deliberate. The
 * relay exposes no self-restriction read, so a member finds out by being refused
 * a send. `parseTimeoutRejection` is that seam, and its prefix is a parse
 * contract with the relay's ingest path.
 */

import {
  KIND_MODERATION_BAN,
  KIND_MODERATION_RESOLVE_REPORT,
  KIND_MODERATION_TIMEOUT,
  KIND_MODERATION_UNBAN,
  KIND_MODERATION_UNTIMEOUT,
  KIND_MUTE_LIST,
  KIND_REPORT,
} from "@/shared/constants/kinds";
import { normalizePubkey } from "@/features/profile/profile-model";

/** NIP-56 report categories, matching the relay's `REPORT_TYPES`. */
export type ReportType =
  | "illegal"
  | "nudity"
  | "malware"
  | "spam"
  | "impersonation"
  | "profanity"
  | "other";

/** A moderator's disposition of a queued report. */
export type ResolutionStatus = "resolved" | "dismissed";

export type ResolutionAction =
  | "delete"
  | "kick"
  | "ban"
  | "timeout"
  | "dismiss"
  | "escalate";

/** A row from `GET /moderation/reports`. */
export interface ModerationReport {
  id: string;
  reportEventId: string;
  reporterPubkey: string;
  targetKind: "event" | "pubkey" | "blob";
  target: string;
  channelId: string | null;
  reportType: string;
  note: string | null;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/** A row from `GET /moderation/audit`. */
export interface ModerationAction {
  id: string;
  actorPubkey: string;
  action: string;
  targetPubkey: string | null;
  targetEventId: string | null;
  channelId: string | null;
  reasonCode: string | null;
  publicReason: string | null;
  createdAt: string;
}

/** A row from `GET /moderation/restricted`. */
export interface CommunityRestriction {
  pubkey: string;
  banned: boolean;
  banExpiresAt: string | null;
  banReason: string | null;
  mutedUntil: string | null;
  muteReason: string | null;
  actorPubkey: string;
  updatedAt: string;
}

/** Report categories in the order shown to a reporter. */
export const REPORT_CATEGORIES: ReadonlyArray<{
  value: ReportType;
  label: string;
}> = [
  { value: "spam", label: "スパム" },
  { value: "profanity", label: "暴言・差別的な発言" },
  { value: "nudity", label: "性的な内容" },
  { value: "impersonation", label: "なりすまし" },
  { value: "malware", label: "マルウェア・詐欺" },
  { value: "illegal", label: "違法な内容" },
  // Last, so it reads as the fallback rather than a first-class choice.
  { value: "other", label: "その他" },
];

const REPORT_TYPE_LABELS = new Map(
  REPORT_CATEGORIES.map((category) => [
    category.value as string,
    category.label,
  ]),
);

/** Label a report category, falling back to the raw value from the relay. */
export function reportTypeLabel(reportType: string): string {
  return REPORT_TYPE_LABELS.get(reportType) ?? reportType;
}

/**
 * Actions as they appear in the audit log.
 *
 * The relay names them, so this is a translation and not a whitelist — an action
 * added relay-side shows up under its own name rather than disappearing from the
 * log, which is the only acceptable failure mode for an audit trail.
 */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  ban: "BAN",
  unban: "BAN解除",
  timeout: "タイムアウト",
  untimeout: "タイムアウト解除",
  kick: "チャンネルから削除",
  delete: "メッセージ削除",
  resolve_report: "通報を処理",
  escalate: "エスカレート",
  dismiss: "却下",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/**
 * Timeout durations offered wherever a moderator picks one.
 *
 * One list, shared by the per-message menu and the report queue, so the two
 * surfaces cannot drift into offering different punishments.
 */
export const TIMEOUT_PRESETS: ReadonlyArray<{
  label: string;
  seconds: number;
}> = [
  { label: "1時間", seconds: 60 * 60 },
  { label: "24時間", seconds: 24 * 60 * 60 },
  { label: "7日間", seconds: 7 * 24 * 60 * 60 },
];

/**
 * Resolve a preset duration to the absolute expiry the command expects.
 *
 * Epoch **seconds**, because that is what the relay's `expiration` tag carries.
 * The relay stamps its own authoritative expiry; this is only the request.
 */
export function timeoutExpiresAt(
  seconds: number,
  nowMs: number = Date.now(),
): number {
  return Math.floor(nowMs / 1000) + seconds;
}

/**
 * Coerce a restriction timestamp to epoch milliseconds.
 *
 * The relay emits RFC3339, but the shape has historically also been unix
 * seconds, so both are accepted. An unparseable value returns `null` and is
 * treated as "no restriction" by the callers — a bad timestamp must not render a
 * phantom ban.
 */
export function parseRestrictionTimestampMs(
  value: string | number | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** True when a `mutedUntil` value is still in the future. */
export function isTimedOut(
  mutedUntil: string | number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const ms = parseRestrictionTimestampMs(mutedUntil);
  return ms != null && ms > nowMs;
}

/** Find one member's restriction row, matching on normalized keys. */
export function findRestriction(
  restrictions: CommunityRestriction[] | undefined,
  pubkey: string | null,
): CommunityRestriction | null {
  if (!pubkey || !restrictions) return null;
  const key = normalizePubkey(pubkey);
  return (
    restrictions.find((row) => normalizePubkey(row.pubkey) === key) ?? null
  );
}

/**
 * The relay's refusal of a write from a timed-out member.
 *
 * A parse contract, not a convenience: the relay's ingest path emits exactly
 * this prefix, and the composer has no other way to learn it is blocked.
 */
const TIMEOUT_PREFIX = "restricted: you are timed out until";

export interface TimeoutRejection {
  /**
   * Expiry in epoch ms, or `null` when the message carried no usable timestamp.
   *
   * `null` still means timed out — the caller shows the block without a
   * countdown rather than pretending the member can send.
   */
  expiresAtMs: number | null;
}

/**
 * Read a relay rejection. Returns a {@link TimeoutRejection} for a timeout
 * refusal, or `null` for anything else, which the caller surfaces through its
 * ordinary error path untouched.
 *
 * The prefix identifies a timeout; the timestamp is best-effort. A malformed
 * trailing value yields `expiresAtMs: null` rather than a false negative — being
 * unable to read the clock is not evidence that the block is not there.
 */
export function parseTimeoutRejection(
  message: string | null | undefined,
): TimeoutRejection | null {
  if (!message) return null;
  const trimmed = message.trim();
  if (!trimmed.startsWith(TIMEOUT_PREFIX)) return null;
  const seconds = Number.parseInt(trimmed.slice(TIMEOUT_PREFIX.length), 10);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    return { expiresAtMs: null };
  }
  return { expiresAtMs: seconds * 1000 };
}

/**
 * True while a known timeout is still running.
 *
 * An unknown expiry counts as active: the member was demonstrably blocked at
 * their last attempt, and guessing otherwise would re-enable a composer that is
 * about to be refused again.
 */
export function isTimeoutActive(
  expiresAtMs: number | null,
  nowMs: number = Date.now(),
): boolean {
  if (expiresAtMs === null) return true;
  return expiresAtMs > nowMs;
}

/**
 * Time left on a timeout, as a short string for the composer banner.
 *
 * `null` when there is no countdown to show — the expiry is unknown, or it has
 * already passed.
 */
export function formatTimeoutRemaining(
  expiresAtMs: number | null,
  nowMs: number = Date.now(),
): string | null {
  if (expiresAtMs === null) return null;
  const total = Math.ceil((expiresAtMs - nowMs) / 1000);
  if (total <= 0) return null;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}時間${minutes}分`;
  if (minutes > 0) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

export interface EventTemplateLike {
  kind: number;
  content: string;
  tags: string[][];
}

/**
 * A NIP-56 report against a message.
 *
 * Both tags are carried: `p` names the author, `e` the message, and the
 * category rides the `e` tag's third element where the relay's triage reads it.
 * The note is prose for a human moderator and is never parsed.
 */
export function buildReportTemplate(input: {
  authorPubkey: string;
  eventId: string;
  reportType: ReportType;
  note?: string;
}): EventTemplateLike {
  return {
    kind: KIND_REPORT,
    content: input.note?.trim() ?? "",
    tags: [
      ["p", normalizePubkey(input.authorPubkey)],
      ["e", input.eventId, input.reportType],
    ],
  };
}

/** Ban a member. An `expiresAt` makes it temporary; omitting it is permanent. */
export function buildBanTemplate(input: {
  pubkey: string;
  expiresAt?: number;
  reason?: string;
}): EventTemplateLike {
  const tags: string[][] = [["p", normalizePubkey(input.pubkey)]];
  if (input.expiresAt != null) {
    tags.push(["expiration", String(input.expiresAt)]);
  }
  if (input.reason?.trim()) tags.push(["reason", input.reason.trim()]);
  return { kind: KIND_MODERATION_BAN, content: "", tags };
}

export function buildUnbanTemplate(pubkey: string): EventTemplateLike {
  return {
    kind: KIND_MODERATION_UNBAN,
    content: "",
    tags: [["p", normalizePubkey(pubkey)]],
  };
}

/** Time a member out. The relay requires an absolute expiry in epoch seconds. */
export function buildTimeoutTemplate(input: {
  pubkey: string;
  expiresAt: number;
  reason?: string;
}): EventTemplateLike {
  const tags: string[][] = [
    ["p", normalizePubkey(input.pubkey)],
    ["expiration", String(input.expiresAt)],
  ];
  if (input.reason?.trim()) tags.push(["reason", input.reason.trim()]);
  return { kind: KIND_MODERATION_TIMEOUT, content: "", tags };
}

export function buildUntimeoutTemplate(pubkey: string): EventTemplateLike {
  return {
    kind: KIND_MODERATION_UNTIMEOUT,
    content: "",
    tags: [["p", normalizePubkey(pubkey)]],
  };
}

/**
 * Actions a moderator may pick when resolving a report.
 *
 * `dismiss` is the only one that pairs with `dismissed`; the relay enforces the
 * pairing, so this exists to stop the UI offering a combination that is going to
 * be refused.
 */
export function resolutionStatusFor(
  action: ResolutionAction,
): ResolutionStatus {
  return action === "dismiss" ? "dismissed" : "resolved";
}

/**
 * Resolve a queued report.
 *
 * `reason` is moderator-authored and readable by the reporter — it lands in the
 * public tombstone and in the notice the reporter receives, so it is not a place
 * for internal notes.
 */
export function buildResolveReportTemplate(input: {
  reportEventId: string;
  action: ResolutionAction;
  reason?: string;
}): EventTemplateLike {
  const tags: string[][] = [
    ["report", normalizePubkey(input.reportEventId)],
    ["status", resolutionStatusFor(input.action)],
    ["action", input.action],
  ];
  if (input.reason?.trim()) tags.push(["reason", input.reason.trim()]);
  return { kind: KIND_MODERATION_RESOLVE_REPORT, content: "", tags };
}

/** Pubkeys on a NIP-51 mute list event. */
export function mutedPubkeysFromEvent(
  event: { tags: string[][] } | null | undefined,
): Set<string> {
  const muted = new Set<string>();
  for (const tag of event?.tags ?? []) {
    if (tag[0] !== "p" || typeof tag[1] !== "string") continue;
    const pubkey = normalizePubkey(tag[1]);
    if (pubkey) muted.add(pubkey);
  }
  return muted;
}

/**
 * The reader's whole mute list, as one replaceable event.
 *
 * kind 10000 is replaceable, so a mute is published as the complete list rather
 * than a delta — sending only the newly muted key would silently unmute everyone
 * else. The list is public in the sense that it is signed and stored unencrypted
 * here; NIP-51 permits a private half, which this does not use.
 */
export function buildMuteListTemplate(pubkeys: Iterable<string>): {
  kind: number;
  content: string;
  tags: string[][];
} {
  const unique = [...new Set([...pubkeys].map(normalizePubkey))].filter(
    Boolean,
  );
  return {
    kind: KIND_MUTE_LIST,
    content: "",
    tags: unique.map((pubkey) => ["p", pubkey]),
  };
}

/** Add or remove one key, returning the full list to publish. */
export function toggleMuted(muted: Set<string>, pubkey: string): Set<string> {
  const key = normalizePubkey(pubkey);
  const next = new Set(muted);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
