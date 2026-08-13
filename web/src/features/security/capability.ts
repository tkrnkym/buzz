/**
 * Capabilities: what may be done, named as `resource:action`.
 *
 * One vocabulary across API, UI, relay and runtime, so a permission means the
 * same thing wherever it is checked. The UI hiding a button is a convenience;
 * the decision is always the server's, and this module exists so the client's
 * convenience cannot disagree with it.
 *
 * The evaluation order is the part worth being careful about. It is not a
 * scoring system — it is a sequence of decisive steps, and the first one that
 * answers wins. Default Deny at the bottom means a capability nobody granted is
 * refused rather than inherited by accident, and an explicit Deny above every
 * grant means a revocation cannot be out-voted by a role that still allows it.
 */

export const CAPABILITIES = [
  "channel:view",
  "channel:create",
  "file:view",
  "file:create",
  "file:publish",
  "agent:execute",
  "workflow:approve",
  "secret:rotate",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * The stages a decision passes through, most decisive first.
 *
 * Ordered as data rather than as nested `if`s so the order itself is testable —
 * a reordering that put a role grant above an explicit deny would be a security
 * bug that reads like a refactor.
 */
export const EVALUATION_ORDER = [
  "legal-hold",
  "explicit-deny",
  "resource-acl",
  "home-channel",
  "role",
  "default",
] as const;

export type EvaluationStage = (typeof EVALUATION_ORDER)[number];

export const STAGE_LABELS: Record<EvaluationStage, string> = {
  "legal-hold": "法的保全・Security Policy",
  "explicit-deny": "明示的 Deny",
  "resource-acl": "リソース固有 ACL",
  "home-channel": "ホーム Channel からの継承",
  role: "Role の Capability",
  default: "該当なし（Deny）",
};

export interface CapabilityInput {
  /** Capabilities held by whoever is asking. */
  subject: ReadonlySet<Capability>;
  /**
   * The agent acting on their behalf, when there is one.
   *
   * A separate set because an agent has its own identity: a person who may
   * publish a file does not thereby let every agent they run publish files.
   */
  agent?: ReadonlySet<Capability>;
  /**
   * What the upstream source permits, for a linked external resource.
   *
   * A connected drive that says no outranks anything this workspace grants —
   * Nuxx cannot widen a permission it does not own.
   */
  source?: ReadonlySet<Capability>;
  /** Capabilities refused outright, whatever else allows them. */
  explicitDeny?: ReadonlySet<Capability>;
  /** Set while a legal hold or a security policy is suspending normal rules. */
  legalHold?: boolean;
  /** Granted on this specific resource, above whatever the role says. */
  resourceAcl?: ReadonlySet<Capability>;
  /** Inherited from the channel the resource belongs to. */
  homeChannel?: ReadonlySet<Capability>;
}

export interface CapabilityDecision {
  allowed: boolean;
  /** Which stage decided, so a refusal can say why rather than just refuse. */
  stage: EvaluationStage;
}

/**
 * Whether one capability is permitted.
 *
 * The intersection of subject, agent and source is taken *first* and applies at
 * every allowing stage: no later grant can hand back something the delegating
 * party never had. That is what makes an agent's authority genuinely bounded by
 * its owner's rather than merely usually smaller.
 */
export function evaluateCapability(
  capability: Capability,
  input: CapabilityInput,
): CapabilityDecision {
  // A hold suspends the ordinary rules rather than being weighed against them.
  if (input.legalHold) return { allowed: false, stage: "legal-hold" };

  if (input.explicitDeny?.has(capability)) {
    return { allowed: false, stage: "explicit-deny" };
  }

  // Every delegating party must hold it. Absent means "not delegating", not
  // "grants everything" — an agent with no capability set can do nothing.
  const delegated =
    input.subject.has(capability) &&
    (input.agent === undefined || input.agent.has(capability)) &&
    (input.source === undefined || input.source.has(capability));

  if (input.resourceAcl?.has(capability)) {
    return { allowed: delegated, stage: "resource-acl" };
  }
  if (input.homeChannel?.has(capability)) {
    return { allowed: delegated, stage: "home-channel" };
  }
  if (input.subject.has(capability)) {
    return { allowed: delegated, stage: "role" };
  }
  return { allowed: false, stage: "default" };
}

/** Convenience for the common case, where only the verdict is needed. */
export function can(capability: Capability, input: CapabilityInput): boolean {
  return evaluateCapability(capability, input).allowed;
}
