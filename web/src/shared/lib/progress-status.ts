import {
  Check,
  CircleStop,
  Clock,
  Loader2,
  TriangleAlert,
  User,
  type LucideIcon,
} from "lucide-react";

/**
 * How a thing in progress is shown, everywhere it is shown.
 *
 * One vocabulary rather than one per feature: a workflow run, an agent turn and
 * a held approval are the same six states to a reader, and three features that
 * each named and coloured them separately is how "waiting" ends up tinted like
 * "running" on one screen and like "stopped" on another.
 *
 * Every entry carries an icon and a word as well as a colour, because colour
 * alone is not a state anyone can read — not at a glance, not with a colour
 * vision deficiency, and not under the 62 themes this client renders in.
 * {@link ProgressBadge} is what enforces that; nothing should reach for
 * `className` on its own.
 *
 * Colours are semantic tokens, never literals, for the same theming reason.
 */
export type ProgressStatus =
  | "running"
  | "awaiting-approval"
  | "awaiting-action"
  | "done"
  | "failed"
  | "stopped";

export interface ProgressPresentation {
  label: string;
  Icon: LucideIcon;
  /** Background and foreground together, so the pair cannot be split up. */
  className: string;
  /** Only a thing that is actually moving turns. */
  spins: boolean;
}

export const PROGRESS_STATUS: Record<ProgressStatus, ProgressPresentation> = {
  // Neutral, not the accent: something merely running is the unremarkable case,
  // and tinting it competes with the two states that do want a person's eye.
  running: {
    label: "実行中",
    Icon: Loader2,
    className: "bg-secondary text-secondary-foreground",
    spins: true,
  },
  // The two waiting states share a colour because they are the same news —
  // this is stuck on a human — and differ by icon and word because they are not
  // the same ask: a clock is "someone must approve", a person is "someone must
  // do something".
  "awaiting-approval": {
    label: "承認待ち",
    Icon: Clock,
    className: "bg-warning-bg text-warning",
    spins: false,
  },
  "awaiting-action": {
    label: "対応待ち",
    Icon: User,
    className: "bg-warning-bg text-warning",
    spins: false,
  },
  done: {
    label: "完了",
    Icon: Check,
    className: "bg-status-added/15 text-status-added",
    spins: false,
  },
  failed: {
    label: "失敗",
    Icon: TriangleAlert,
    className: "bg-destructive/10 text-destructive",
    spins: false,
  },
  // Grey, and the only state that is: stopped is the one where nothing is
  // pending and nothing went wrong, so it should recede rather than report.
  stopped: {
    label: "停止",
    Icon: CircleStop,
    className: "bg-muted text-muted-foreground",
    spins: false,
  },
};
