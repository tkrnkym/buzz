/**
 * The onboarding step machine.
 *
 * The desktop client's flow had a branch the web one cannot copy: it could mint a
 * key, hold it in the OS keyring, and show the reader their `nsec` to write down.
 * A browser has nowhere safe to put a secret key — `localStorage` is readable by
 * any script that gets injected — so the honest version of this flow either hands
 * custody to a NIP-07 extension or admits the key lasts one page load.
 *
 * That difference decides the steps. With an extension the identity step is a
 * confirmation; without one it is a warning, and skipping it is allowed because a
 * reader who just wants to look around should not be blocked by an install.
 *
 * Pure so the branching is testable without a signer or a DOM.
 */

export type OnboardingStep =
  | "welcome"
  | "identity"
  | "profile"
  | "invite"
  | "done";

export interface OnboardingState {
  /** Whether a NIP-07 extension is present, which is what decides custody. */
  hasExtension: boolean;
  /** Whether the reader arrived with an invite code to redeem. */
  hasInvite: boolean;
}

/**
 * The steps this reader will see, in order.
 *
 * The invite step is skipped when there is nothing to redeem: an empty field
 * asking for a code the reader does not have is a dead end, not a step.
 */
export function onboardingSteps(state: OnboardingState): OnboardingStep[] {
  return [
    "welcome",
    "identity",
    "profile",
    ...(state.hasInvite ? (["invite"] as const) : []),
    "done",
  ];
}

export function nextStep(
  current: OnboardingStep,
  state: OnboardingState,
): OnboardingStep {
  const steps = onboardingSteps(state);
  const index = steps.indexOf(current);
  // An unknown step lands on the first, which is the only recoverable answer —
  // there is nothing sensible "after" a step that is not in the flow.
  if (index === -1) return steps[0];
  return steps[Math.min(index + 1, steps.length - 1)];
}

export function previousStep(
  current: OnboardingStep,
  state: OnboardingState,
): OnboardingStep {
  const steps = onboardingSteps(state);
  const index = steps.indexOf(current);
  if (index <= 0) return steps[0];
  return steps[index - 1];
}

/** Position in the flow, for the progress line. */
export function stepPosition(
  current: OnboardingStep,
  state: OnboardingState,
): { index: number; total: number } {
  const steps = onboardingSteps(state);
  // "done" is not a step someone works through, so it is excluded from the count —
  // a progress line reading "4 of 4" on a screen with nothing to do is noise.
  const working: OnboardingStep[] = steps.filter((step) => step !== "done");
  const index = working.indexOf(current);
  return { index: index === -1 ? 0 : index, total: working.length };
}

export const STEP_TITLES: Record<OnboardingStep, string> = {
  welcome: "Nuxx へようこそ",
  identity: "あなたの鍵",
  profile: "プロフィール",
  invite: "コミュニティに参加",
  done: "準備ができました",
};

/**
 * Whether the reader may leave this step without finishing it.
 *
 * Everything is skippable except the welcome, and that is deliberate: a profile
 * can be filled in later from Settings, and an identity warning is information
 * rather than a task. A flow that trapped someone on a step they cannot complete —
 * no extension to hand, no invite to paste — would be worse than one they can
 * walk out of.
 */
export function canSkip(step: OnboardingStep): boolean {
  return step !== "welcome" && step !== "done";
}

/** The storage key marking this browser as having been through the flow. */
export const ONBOARDING_SEEN_KEY = "nuxx-onboarding.v1:seen";

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_SEEN_KEY) === "1";
  } catch {
    // Storage unavailable (private mode): treat as seen rather than showing the
    // flow on every single load, which is the more annoying failure.
    return true;
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
  } catch {
    // Ignored for the reason above.
  }
}
