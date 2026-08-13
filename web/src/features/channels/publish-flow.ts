import type {
  PublishDecision,
  SecretFinding,
} from "@/features/channels/secret-scan";

/**
 * Turning a private channel public, as a sequence with gates.
 *
 * The order is not decoration. A reader has to see *what* will become visible
 * before being asked whether to do it, and the scan has to have run before the
 * confirmation, or the confirmation is uninformed. Re-authentication comes last
 * so it is spent on the decision actually being made rather than on opening a
 * dialog someone will cancel.
 *
 * Two rules from the spec are load-bearing and easy to get wrong:
 *
 * - There is no waiting period and no second approver. A maintainer decides
 *   alone and it takes effect immediately, so every safeguard has to be in this
 *   flow — there is no later stage that catches anything.
 * - A blocking finding is a refusal, not a warning. `canPublish` returns false
 *   for it no matter what else is true, which is what stops a "publish anyway"
 *   from being wired up by accident.
 */

export type PublishStep = "preview" | "findings" | "confirm" | "done";

/** The steps in order, which is also what the dialog's progress reads from. */
export const PUBLISH_STEPS: PublishStep[] = [
  "preview",
  "findings",
  "confirm",
  "done",
];

export interface PublishState {
  step: PublishStep;
  decision: PublishDecision;
  /** True once the reader has re-authenticated for this change. */
  reauthenticated: boolean;
  /** True once the reader has acknowledged the contextual warnings. */
  acknowledged: boolean;
}

/**
 * Whether the flow may leave this step.
 *
 * `findings` is the gate: a blocked scan never advances, and a scan with
 * warnings advances only once they have been acknowledged — which is what
 * "Maintainerが判断する" means in practice.
 */
export function canAdvance(state: PublishState): boolean {
  switch (state.step) {
    case "preview":
      return true;
    case "findings":
      if (state.decision === "blocked") return false;
      return state.decision === "clear" || state.acknowledged;
    case "confirm":
      return canPublish(state);
    case "done":
      return false;
  }
}

/** The step after this one, or `null` where the flow cannot go on. */
export function nextStep(state: PublishState): PublishStep | null {
  if (!canAdvance(state)) return null;
  const index = PUBLISH_STEPS.indexOf(state.step);
  return PUBLISH_STEPS[index + 1] ?? null;
}

/**
 * Whether the change may actually be made.
 *
 * Checked at the point of action rather than inferred from having reached the
 * last step, so a flow that is driven out of order — a test, a keyboard path, a
 * future caller — still cannot publish something the scan refused.
 */
export function canPublish(state: PublishState): boolean {
  if (state.decision === "blocked") return false;
  if (state.decision === "needs-confirmation" && !state.acknowledged) {
    return false;
  }
  return state.reauthenticated;
}

/**
 * What the reader is told about the scan result.
 *
 * The blocked case names the consequence rather than the rule — "cannot be
 * published" rather than "policy violation" — because the reader's next action
 * is to go and remove the thing, and they need to know that is the only way on.
 */
export function findingsSummary(
  decision: PublishDecision,
  findings: SecretFinding[],
): string {
  const blocking = findings.filter(
    (finding) => finding.severity === "blocking",
  ).length;
  switch (decision) {
    case "blocked":
      return `公開できません。確定的な秘密情報が ${blocking} 件見つかりました。該当箇所を取り除いてからやり直してください。`;
    case "needs-confirmation":
      return `${findings.length} 件、公開してよいか判断が必要な記載があります。内容を確認してください。`;
    case "clear":
      return "秘密情報らしき記載は見つかりませんでした。";
  }
}

/**
 * The audit record written when the change is made.
 *
 * Who and what, together — a record that says a channel was published without
 * saying who did it is not an audit record. The warning count is kept because
 * "published despite three flagged passages" is the thing a later reviewer is
 * actually trying to reconstruct.
 */
export interface PublishAuditEntry {
  channelId: string;
  channelName: string;
  actorPubkey: string;
  at: number;
  acknowledgedWarnings: number;
}

export function buildAuditEntry({
  actorPubkey,
  at,
  channelId,
  channelName,
  findings,
}: {
  actorPubkey: string;
  at: number;
  channelId: string;
  channelName: string;
  findings: SecretFinding[];
}): PublishAuditEntry {
  return {
    channelId,
    channelName,
    actorPubkey,
    at,
    acknowledgedWarnings: findings.filter(
      (finding) => finding.severity === "warning",
    ).length,
  };
}
