import type { PulseEntry, PulseTab } from "@/mock/showcase";

/**
 * How a Pulse entry reads.
 *
 * The feed carries two things that are not the same kind of thing: a note
 * someone chose to write down, and a report an agent filed about a run. They
 * were rendered with the same card and a 10px icon to tell them apart, which put
 * "ハーネスの起動に失敗しました" in the same muted grey as a style guideline —
 * a stopped agent looked exactly like a memo.
 */

export type PulseCardKind = "note" | "agent-report" | "agent-failure";

/**
 * Which card an entry gets.
 *
 * Read off `outcome` rather than guessed from the body. Looking for "失敗" in
 * prose would misfire in both directions: a note *about* a failure is not one,
 * and an agent that stopped without using the word still stopped.
 */
export function cardKind(entry: PulseEntry): PulseCardKind {
  if (entry.tab === "notes") return "note";
  return entry.outcome === "failed" ? "agent-failure" : "agent-report";
}

/**
 * The card's frame, per kind.
 *
 * A failure gets the destructive border it has earned; the other two stay quiet,
 * because a feed where every row is emphasised has no emphasis left for the one
 * row that needs it.
 */
export const CARD_CLASS: Record<PulseCardKind, string> = {
  note: "border-border",
  "agent-report": "border-border",
  "agent-failure": "border-destructive/40 bg-destructive/5",
};

/** What the entry is, in the reader's terms. */
export const CARD_LABELS: Record<PulseCardKind, string> = {
  note: "ノート",
  "agent-report": "エージェントの報告",
  "agent-failure": "止まっています",
};

/**
 * Entries for a tab, newest first.
 *
 * Chronological even for a failure. It is tempting to float a stopped agent to
 * the top, but this is a record of what happened rather than a queue of work, and
 * an entry that jumps position is an entry the reader cannot find again. The card
 * carries the urgency instead.
 */
export function pulseEntriesFor(
  entries: PulseEntry[],
  tab: PulseTab,
): PulseEntry[] {
  const scoped =
    tab === "all" ? entries : entries.filter((entry) => entry.tab === tab);
  return [...scoped].sort((left, right) => right.at - left.at);
}

/**
 * How many entries each tab holds.
 *
 * On the tabs because the shorter list is the one that gets missed: with three
 * unlabelled tabs there is no way to tell an empty one from one nobody opened,
 * and the agents tab is exactly where a stopped agent is waiting.
 */
export function pulseTabCounts(
  entries: PulseEntry[],
): Record<PulseTab, number> {
  return {
    all: entries.length,
    notes: entries.filter((entry) => entry.tab === "notes").length,
    agents: entries.filter((entry) => entry.tab === "agents").length,
  };
}

/**
 * Whether the agents tab has something wrong in it.
 *
 * Surfaced on the tab rather than only inside it: the reason to look at a feed of
 * agent reports is almost always that one of them stopped, and finding that out
 * requires opening the tab that does not say so.
 */
export function hasFailure(entries: PulseEntry[]): boolean {
  return entries.some((entry) => cardKind(entry) === "agent-failure");
}
