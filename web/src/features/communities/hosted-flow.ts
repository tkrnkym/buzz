import {
  hostedNameError,
  hostedRelayUrl,
  type JoinPolicy,
} from "@/features/communities/community-model";
import type { ShowcaseCommunity } from "@/mock/showcase";

/**
 * Setting up a hosted community, step by step.
 *
 * Creating one was a single text field and a toast. That is enough to *name* a
 * community and nothing like enough to have one: the person doing it has just
 * become its owner, and the two decisions that follow — who can get in, and who
 * else is in it — are exactly the ones that are painful to discover later. A
 * three-step flow asks them while the reader is still thinking about the
 * community rather than a week after they gave up looking for the setting.
 *
 * Pure, so the order and the gates are testable without rendering anything.
 */

export type HostedStep = "name" | "policy" | "invite" | "done";

/** In order. The array is the source of truth for next/previous and the counter. */
export const HOSTED_STEPS: readonly HostedStep[] = [
  "name",
  "policy",
  "invite",
  "done",
];

export const HOSTED_STEP_TITLES: Record<HostedStep, string> = {
  name: "コミュニティに名前をつける",
  policy: "誰が参加できるか",
  invite: "はじめのメンバーを呼ぶ",
  done: "できました",
};

export interface HostedDraft {
  name: string;
  joinPolicy: JoinPolicy;
  /** Addresses typed on the invite step, one per line as entered. */
  inviteTo: string;
}

export const EMPTY_HOSTED_DRAFT: HostedDraft = {
  name: "",
  joinPolicy: "invite",
  inviteTo: "",
};

export function stepIndex(step: HostedStep): number {
  return HOSTED_STEPS.indexOf(step);
}

/**
 * The step after this one, or the same step at the end.
 *
 * Clamped rather than wrapping: the last step is a result, and a "next" that
 * returned the reader to the name field would read as the community not having
 * been created.
 */
export function nextStep(step: HostedStep): HostedStep {
  const index = stepIndex(step);
  return HOSTED_STEPS[Math.min(index + 1, HOSTED_STEPS.length - 1)] ?? step;
}

export function previousStep(step: HostedStep): HostedStep {
  const index = stepIndex(step);
  return HOSTED_STEPS[Math.max(index - 1, 0)] ?? step;
}

/**
 * Whether this step can be left.
 *
 * Only the name is required. A join policy always has a value — the draft starts
 * at invite-only, which is the safe default for something that does not exist yet
 * — and the invite step is skippable, because a community of one is a legitimate
 * thing to create and blocking on "invite somebody" would be a demand rather than
 * an offer.
 */
export function canAdvance(step: HostedStep, draft: HostedDraft): boolean {
  if (step === "name") return hostedNameError(draft.name) === null;
  return true;
}

/**
 * The addresses to invite, cleaned up.
 *
 * Split on newlines and commas because people paste both, and a list that only
 * accepted one separator would silently invite a single address made of three.
 */
export function inviteRecipients(draft: HostedDraft): string[] {
  return draft.inviteTo
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** The link the last step hands out, for the people who were not listed. */
export function hostedInviteLink(name: string, code: string): string {
  return `https://${name.trim().toLowerCase()}.nuxx.host/invite/${code}`;
}

/**
 * The community a finished draft describes.
 *
 * `memberCount` counts the owner plus whoever was invited. Counting the invites as
 * members is the honest reading here — this is a mock-up, and a community that
 * reported 1 member after inviting four would look like the invites had failed.
 */
export function hostedDraftToCommunity(
  draft: HostedDraft,
  id: string,
): ShowcaseCommunity {
  const name = draft.name.trim().toLowerCase();
  return {
    id,
    name,
    relayUrl: hostedRelayUrl(name),
    memberCount: 1 + inviteRecipients(draft).length,
    hosted: true,
    joinPolicy: draft.joinPolicy,
  };
}
