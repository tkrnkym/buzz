/**
 * Whether a model fits the machine that would serve it.
 *
 * The desktop client reads the machine's AI memory and sizes the suggestions
 * against it. A browser cannot: there is no API for GPU or unified memory, and
 * `navigator.deviceMemory` is system RAM, rounded, capped at 8 and absent outside
 * Chromium. So the fit is computed against a budget the *reader* states, and the
 * screen says where that number came from — a guessed "Recommended for this
 * machine" would be a claim the client cannot support.
 */

export type Fit = "fits" | "tight" | "over";

export const FIT_LABELS: Record<Fit, string> = {
  fits: "余裕あり",
  tight: "ぎりぎり",
  over: "入りません",
};

/**
 * How a model of this size sits in a memory budget.
 *
 * "Tight" starts at 70% because a model that fills the budget leaves nothing for
 * the context window, which grows with the conversation — a model that loads and
 * then fails on a long thread is worse than one that never loaded.
 */
export function fitFor(sizeGb: number, budgetGb: number): Fit {
  if (budgetGb <= 0) return "over";
  const ratio = sizeGb / budgetGb;
  if (ratio > 1) return "over";
  return ratio > 0.7 ? "tight" : "fits";
}

/**
 * The suggestions, best fit first.
 *
 * Models that do not fit stay on the list rather than being hidden: the reader's
 * next question about one is whether a smaller quantization exists, and a list that
 * silently drops it turns "too big for you" into "does not exist" — the same rule
 * the harness catalog follows.
 */
export function rankModels<T extends { sizeGb: number }>(
  models: ReadonlyArray<T>,
  budgetGb: number,
): { model: T; fit: Fit }[] {
  const order: Record<Fit, number> = { fits: 0, tight: 1, over: 2 };
  return [...models]
    .map((model) => ({ model, fit: fitFor(model.sizeGb, budgetGb) }))
    .sort(
      (left, right) =>
        order[left.fit] - order[right.fit] ||
        right.model.sizeGb - left.model.sizeGb,
    );
}
