import type { Harness, Showcase } from "@/mock/showcase";

/**
 * Fixture edits for the harness catalog.
 *
 * "Add a harness" used to raise a toast and leave the list untouched, so the row
 * the reader had just described was nowhere — the dialog closed on an unchanged
 * screen, which reads as a failure that claimed to succeed.
 */

/**
 * Register a harness the reader runs themselves.
 *
 * Marked `available` with no version. The browser cannot probe for a local
 * binary, so claiming a version would be inventing one; but a row the reader just
 * described as their own command, listed as "not found", would be the client
 * contradicting them about their own machine. `custom` is what keeps it
 * distinguishable from the shipped catalog, where availability is real data.
 */
export function addHarness(
  current: Showcase,
  harness: { id: string; name: string; command: string },
): Showcase {
  const row: Harness = {
    id: harness.id,
    name: harness.name,
    command: harness.command,
    version: null,
    available: true,
    installUrl: "",
    custom: true,
  };
  return { ...current, harnesses: [...current.harnesses, row] };
}

/**
 * Remove one the reader added.
 *
 * Only the custom ones can go. The shipped catalog is a statement about what
 * exists rather than a list of the reader's choices, and hiding an uninstalled
 * harness from it would turn "not installed" into "does not exist" — the thing
 * the panel is written to avoid.
 */
export function removeCustomHarness(current: Showcase, id: string): Showcase {
  return {
    ...current,
    harnesses: current.harnesses.filter(
      (row) => row.id !== id || row.custom !== true,
    ),
  };
}
