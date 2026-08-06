import {
  Bot,
  Gem,
  Sparkle,
  Sprout,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";

import type { Harness } from "@/mock/showcase";

/**
 * A leading glyph for a harness row.
 *
 * The desktop client draws each one's own illustrated logo; this repo has no
 * such asset (and no license to redraw a third party's mark), so a themed
 * stock icon stands in — matched by name rather than id, since a reader's own
 * custom harness still deserves something better than a blank space.
 */
export function harnessIcon(harness: Harness): LucideIcon {
  const name = harness.name.toLowerCase();
  if (name.includes("claude")) return Sparkle;
  if (name.includes("codex")) return TerminalSquare;
  if (name.includes("gemini")) return Gem;
  if (harness.custom) return Sprout;
  return Bot;
}
