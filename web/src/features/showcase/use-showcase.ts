import { SHOWCASE, type Showcase } from "@/mock/showcase";

/**
 * Fixtures for the mock-up screens, or `null` when there are none.
 *
 * The screens below `features/` — Agents, Projects, Workflows, Pulse,
 * Reminders, Forum, Huddle, members — are built for real but have no relay data
 * path yet. This is the one place that decides whether they have anything to
 * show.
 *
 * `null` outside the demo build, on purpose. Someone pointing this client at a
 * real relay must not be shown invented projects and agents as if they were
 * theirs; the screens render an honest "not connected yet" panel instead. When
 * a feature gets a real data path, its screen swaps this hook for that one and
 * nothing else has to move.
 */
export function useShowcase(): Showcase | null {
  return isShowcaseEnabled() ? SHOWCASE : null;
}

/** Whether the mock-up screens have data behind them. */
export function isShowcaseEnabled(): boolean {
  return import.meta.env.VITE_MOCK_RELAY === "1";
}
