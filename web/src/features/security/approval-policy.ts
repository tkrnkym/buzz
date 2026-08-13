/**
 * Approval policies: how long a decision may sit, and who may change that.
 *
 * Two rules do the work here.
 *
 * The deadline is per risk class, not per approval. A destructive operation
 * held for a week is not "still pending" — the context that made it a
 * reasonable request is gone, and approving it then is approving something
 * nobody re-examined. So the riskier the operation, the shorter it may wait.
 *
 * And an agent, workflow or plugin may only *tighten* the workspace policy.
 * Letting a workflow widen its own approval window is letting the thing being
 * governed rewrite the governance, which is how a policy becomes decorative.
 */

export type RiskClass =
  | "standard"
  | "external-send"
  | "production-change"
  | "destructive";

export interface RiskInfo {
  id: RiskClass;
  label: string;
  description: string;
  /** The workspace default, in seconds. Overridable, but only downward. */
  defaultSeconds: number;
}

const HOUR = 3_600;
const DAY = 24 * HOUR;

export const RISK_CLASSES: ReadonlyArray<RiskInfo> = [
  {
    id: "standard",
    label: "通常の承認",
    description: "ふつうの依頼。急がないが、放置されると忘れられる。",
    defaultSeconds: 7 * DAY,
  },
  {
    id: "external-send",
    label: "外部送信",
    description: "Workspace の外へ内容が出るもの。取り消せない。",
    defaultSeconds: DAY,
  },
  {
    id: "production-change",
    label: "本番変更・権限拡大",
    description: "動いているものを変える、あるいは誰かの権限を広げる。",
    defaultSeconds: DAY,
  },
  {
    id: "destructive",
    label: "破壊的・高リスク操作",
    description:
      "取り返しがつかない。判断は依頼された文脈の中でしか正しくない。",
    defaultSeconds: HOUR,
  },
];

export const DEFAULT_DEADLINES: Record<RiskClass, number> = Object.fromEntries(
  RISK_CLASSES.map((risk) => [risk.id, risk.defaultSeconds]),
) as Record<RiskClass, number>;

export type ApprovalState = "pending" | "approved" | "rejected" | "expired";

export const APPROVAL_STATE_LABELS: Record<ApprovalState, string> = {
  pending: "承認待ち",
  approved: "承認済み",
  rejected: "却下",
  expired: "期限切れ",
};

/**
 * Whether an override is allowed.
 *
 * Tightening only: a shorter window is a stricter policy, and stricter is
 * always permitted. Anything longer than the workspace's own value is refused
 * rather than clamped, so the caller finds out they wrote something that will
 * not take effect instead of silently getting a different number.
 */
export function isTightening(
  workspaceSeconds: number,
  overrideSeconds: number,
): boolean {
  return overrideSeconds > 0 && overrideSeconds <= workspaceSeconds;
}

/**
 * The deadline actually applied, given a workspace value and an override.
 *
 * An override that widens is ignored — the workspace's value stands. This
 * returns the number rather than throwing because a policy that fails closed on
 * a bad override is better than one that fails to load.
 */
export function effectiveDeadlineSeconds(
  workspaceSeconds: number,
  overrideSeconds?: number,
): number {
  if (overrideSeconds === undefined) return workspaceSeconds;
  return isTightening(workspaceSeconds, overrideSeconds)
    ? overrideSeconds
    : workspaceSeconds;
}

export interface ApprovalRequest {
  id: string;
  risk: RiskClass;
  requestedAt: number;
  state: ApprovalState;
  /** The policy version this run was pinned to when it started. */
  policyVersion: number;
}

/**
 * Whether a pending request has run out of time.
 *
 * Measured from when it was requested, against the deadline for its risk class.
 * A request already resolved is never re-examined — an approved decision does
 * not expire retroactively.
 */
export function isExpired(
  request: ApprovalRequest,
  deadlines: Record<RiskClass, number>,
  nowSeconds: number,
): boolean {
  if (request.state !== "pending") return false;
  return nowSeconds - request.requestedAt >= deadlines[request.risk];
}

/**
 * The state to show, with expiry applied.
 *
 * Derived rather than stored, so a request cannot sit in the list claiming to
 * be pending because no job happened to sweep it.
 */
export function resolveApprovalState(
  request: ApprovalRequest,
  deadlines: Record<RiskClass, number>,
  nowSeconds: number,
): ApprovalState {
  return isExpired(request, deadlines, nowSeconds) ? "expired" : request.state;
}

/** Seconds left, or 0 once the deadline has passed. */
export function secondsRemaining(
  request: ApprovalRequest,
  deadlines: Record<RiskClass, number>,
  nowSeconds: number,
): number {
  const deadline = request.requestedAt + deadlines[request.risk];
  return Math.max(0, deadline - nowSeconds);
}

/** `7日` / `24時間` / `1時間` / `12分`, in the largest unit that stays whole. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0分";
  if (seconds % DAY === 0) return `${seconds / DAY}日`;
  if (seconds % HOUR === 0) return `${seconds / HOUR}時間`;
  return `${Math.max(1, Math.round(seconds / 60))}分`;
}

/**
 * Whether an expired request may simply be resumed.
 *
 * It may not. "再開時は新しい実行として権限とPolicyを再評価する" — the capabilities
 * and the policy that were pinned when it started may both have changed, and
 * continuing on the old ones is how a revoked permission gets used anyway.
 */
export function canResumeExpired(): boolean {
  return false;
}
