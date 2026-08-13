/**
 * Withdrawing something that has already been federated.
 *
 * A public resource cannot be recalled — copies exist — so revocation is a
 * signed statement that it should no longer be used, not a delete. Registries
 * and instances that follow the advisory drop it from search, cache and
 * execution; an independent fork is not touched, because it is somebody else's
 * copy and the signature says "we withdraw ours", not "you must delete yours".
 *
 * Nothing here requires being online with a registry. An instance fetches
 * signed advisories periodically and verifies them locally, and a fully
 * disconnected one imports a signed bundle by hand. That is why verification is
 * a local operation on a signature rather than a call: an air-gapped deployment
 * that cannot check revocations is one that keeps running revoked code.
 *
 * The staleness deadline below is **not settled** in the design doc. The values
 * here are its provisional proposal and are labelled as such wherever they are
 * shown — presenting an undecided number as policy is how a placeholder becomes
 * the answer by default.
 */

export type RevocationState =
  | "active"
  | "superseded"
  | "deprecated"
  | "revoked";

export const REVOCATION_LABELS: Record<RevocationState, string> = {
  active: "利用できます",
  superseded: "新しい版があります",
  deprecated: "将来使えなくなります",
  revoked: "使用禁止",
};

/**
 * Whether a state stops something being used now.
 *
 * Only `revoked` does. `superseded` and `deprecated` are notices about the
 * future — treating them as blocking would break working deployments on the
 * day a new version shipped.
 */
export function blocksExecution(state: RevocationState): boolean {
  return state === "revoked";
}

/** Whether it should still appear in search and be kept in cache. */
export function staysDiscoverable(state: RevocationState): boolean {
  return state !== "revoked";
}

/**
 * Whether a local fork is affected by an upstream revocation.
 *
 * It is not. The signature withdraws the publisher's own copy; a fork someone
 * else maintains is theirs, and auto-deleting it would make a registry able to
 * reach into deployments it does not own.
 */
export function affectsIndependentFork(): boolean {
  return false;
}

export type Edition = "saas" | "enterprise" | "community";

export interface StalenessRule {
  edition: Edition;
  label: string;
  /** How old revocation data may get before it is treated as unusable. */
  maxAgeSeconds: number;
  /** What happens past that age. */
  onStale: "block-new-registry-runs" | "block-high-risk" | "warn";
  onStaleLabel: string;
}

/**
 * Provisional — the doc records this as undecided.
 *
 * Kept here so the screen can show the proposal *and* say it is one. The
 * alternative, leaving it out, means each deployment invents its own and the
 * question never gets settled.
 */
export const STALENESS_IS_PROVISIONAL = true;

export const STALENESS_RULES: ReadonlyArray<StalenessRule> = [
  {
    edition: "saas",
    label: "SaaS",
    maxAgeSeconds: 3_600,
    onStale: "block-new-registry-runs",
    onStaleLabel: "Registry 由来の新しい実行を止めます",
  },
  {
    edition: "enterprise",
    label: "Enterprise",
    maxAgeSeconds: 24 * 3_600,
    onStale: "block-high-risk",
    onStaleLabel: "高リスクの実行を止めます",
  },
  {
    edition: "community",
    label: "Community Edition",
    maxAgeSeconds: 7 * 24 * 3_600,
    onStale: "warn",
    onStaleLabel: "警告します（設定で停止にもできます）",
  },
];

/** Whether the revocation data this instance holds is too old to rely on. */
export function isStale(
  rule: StalenessRule,
  fetchedAt: number,
  nowSeconds: number,
): boolean {
  return nowSeconds - fetchedAt > rule.maxAgeSeconds;
}

export interface Advisory {
  id: string;
  /** The resource being spoken about. */
  target: string;
  state: RevocationState;
  issuedAt: number;
  /** Verified locally against the issuer's key — never by asking a service. */
  signatureValid: boolean;
  /** Critical ones are quarantined locally rather than merely delisted. */
  critical: boolean;
}

/**
 * Whether an advisory may be acted on.
 *
 * An unverified one is ignored entirely. Acting on an unsigned "this is
 * revoked" would let anyone who can reach the instance disable anything on it,
 * which is a denial-of-service with extra steps.
 */
export function isActionable(advisory: Advisory): boolean {
  return advisory.signatureValid;
}

/**
 * The advisories that change what this instance does.
 *
 * Unverified ones are dropped rather than surfaced as "unknown": a list mixing
 * verified and unverified claims invites someone to act on the wrong half.
 */
export function actionableAdvisories(advisories: Advisory[]): Advisory[] {
  return advisories.filter(isActionable);
}

/** Whether this one is quarantined locally rather than just delisted. */
export function requiresQuarantine(advisory: Advisory): boolean {
  return (
    isActionable(advisory) && advisory.critical && advisory.state === "revoked"
  );
}

/**
 * Whether a live registry connection is needed to be current.
 *
 * No. Advisories are fetched periodically and verified locally, and an
 * air-gapped deployment imports a signed bundle by hand — a design that
 * required connectivity would leave exactly the most isolated deployments
 * running revoked code.
 */
export function requiresLiveRegistry(): boolean {
  return false;
}
