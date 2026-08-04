import type {
  AgentSessionEvent,
  SessionRenderClass,
  SessionTone,
} from "@/mock/showcase";

/**
 * How an agent's run reads.
 *
 * The desktop client spread this across nine files under
 * `ui/AgentSessionToolItem/` plus four classifier modules. The rules are the
 * same; they are collected here because they are decisions about meaning rather
 * than markup, and they are far easier to be sure of as data than as JSX.
 */

/** Label for a render class, in the reader's terms rather than the wire's. */
export const RENDER_CLASS_LABELS: Record<SessionRenderClass, string> = {
  message: "発言",
  shell: "コマンド",
  "file-edit": "編集",
  "file-read": "読み取り",
  "relay-op": "リレー操作",
  thought: "考えたこと",
  plan: "計画",
  permission: "許可",
  error: "エラー",
};

/**
 * Colour for a tone.
 *
 * Writes and admin actions are the ones an operator scans for, so they get the
 * accent and the destructive-adjacent warning respectively; reads recede. Using
 * the theme's own tokens rather than fixed colours is what keeps this legible
 * under all 62 themes.
 */
export const TONE_CLASS: Record<SessionTone, string> = {
  read: "text-muted-foreground",
  write: "text-primary",
  admin: "text-warning",
  neutral: "text-foreground",
};

/**
 * Whether a row's body should start open.
 *
 * A failure is open, because the reason is the only thing the reader came for. A
 * plan is open while it is unfinished, since a half-done checklist is the state
 * worth seeing. Everything else starts closed: a run with eight shell outputs
 * expanded is a wall, and the labels are written to be enough on their own.
 */
export function startsExpanded(event: AgentSessionEvent): boolean {
  if (event.status === "failed") return true;
  if (event.detail?.kind === "todo") {
    return event.detail.items.some((item) => !item.done);
  }
  return false;
}

/**
 * A run's headline: what it is doing now, or how it ended.
 *
 * Reads the last event rather than counting, because "7 件" tells an operator
 * nothing they can act on and the last line usually tells them everything.
 */
export function sessionSummary(events: AgentSessionEvent[]): {
  label: string;
  tone: SessionTone;
  status: "running" | "done" | "failed" | "empty";
} {
  const last = events[events.length - 1];
  if (!last) {
    return { label: "まだ何もしていません", tone: "neutral", status: "empty" };
  }
  return { label: last.label, tone: last.tone, status: last.status };
}

/**
 * Consecutive reads collapsed into one row.
 *
 * An agent reading eleven files in a row is one action to a person following
 * along, and eleven rows of "読み取り" pushes the write that follows off the
 * screen — which is the row they were waiting for. Only reads collapse: two
 * consecutive edits are two separate things that happened.
 */
export type SessionGroup =
  | { kind: "single"; event: AgentSessionEvent }
  | { kind: "reads"; events: AgentSessionEvent[] };

export function groupSessionEvents(
  events: AgentSessionEvent[],
): SessionGroup[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const groups: SessionGroup[] = [];

  for (const event of ordered) {
    const collapsible =
      event.renderClass === "file-read" && event.status !== "failed";
    const previous = groups[groups.length - 1];
    if (collapsible && previous?.kind === "reads") {
      previous.events.push(event);
      continue;
    }
    groups.push(
      collapsible
        ? { kind: "reads", events: [event] }
        : { kind: "single", event },
    );
  }

  return groups;
}

/**
 * The label for a collapsed group of reads.
 *
 * Names the file when there is one, and counts when there are several — a count
 * alone ("3 件を読みました") hides which file, and three separate rows for three
 * files was the problem.
 */
export function readsLabel(events: AgentSessionEvent[]): string {
  const [first] = events;
  if (!first) return "";
  if (events.length === 1) return first.label;
  return `${first.label} ほか ${events.length - 1} 件`;
}

/**
 * The events an agent has "so far", for the replay control.
 *
 * Replay exists because a transcript that is already complete on arrival shows
 * the shape of the feature but not the thing it is for — watching an agent work.
 * It is a slice rather than a timer so the visible state is a number the caller
 * owns, which keeps it testable and keeps a test from waiting on wall-clock time.
 */
export function eventsUpTo(
  events: AgentSessionEvent[],
  count: number,
): AgentSessionEvent[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  return ordered.slice(0, Math.max(0, Math.min(count, ordered.length)));
}

/** Diff lines split into their sign and text, so the sign is not rendered twice. */
export function diffLineParts(line: string): {
  sign: "add" | "remove" | "context";
  text: string;
} {
  if (line.startsWith("+")) return { sign: "add", text: line.slice(1) };
  if (line.startsWith("-")) return { sign: "remove", text: line.slice(1) };
  return { sign: "context", text: line.startsWith(" ") ? line.slice(1) : line };
}

/** `+n −m` for a diff, which is what a reader checks before opening it. */
export function diffStat(lines: string[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    const { sign } = diffLineParts(line);
    if (sign === "add") added += 1;
    if (sign === "remove") removed += 1;
  }
  return { added, removed };
}
