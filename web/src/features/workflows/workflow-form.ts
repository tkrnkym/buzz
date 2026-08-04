/**
 * The workflow builder's form model.
 *
 * A workflow in Nuxx is YAML-as-code: a trigger, and a list of steps each with an
 * optional `evalexpr` condition (see `nuxx-workflow`). This file is the bridge
 * between a form someone fills in and that definition — kept pure so the rules can
 * be tested without a dialog, and because the interesting parts are rules rather
 * than markup.
 *
 * Two decisions worth stating, because both come from what the engine does:
 *
 * - Each action has its own required fields. "Send a message" needs a body; "call
 *   a webhook" needs a URL. Validating per-action rather than per-form is what
 *   lets the dialog say *which* step is incomplete instead of refusing the whole
 *   thing with one message.
 * - A condition is an expression, not a sentence. It is left as free text and
 *   never parsed here: guessing at evalexpr syntax client-side would reject valid
 *   expressions, and being wrong in that direction is unrecoverable for the person
 *   writing one.
 */

/** What can start a workflow. Matches the engine's trigger kinds. */
export const TRIGGER_TYPES = [
  "message_posted",
  "reaction_added",
  "diff_posted",
  "webhook",
  "schedule",
] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  message_posted: "メッセージが投稿されたとき",
  reaction_added: "リアクションが付いたとき",
  diff_posted: "差分が投稿されたとき",
  webhook: "Webhook を受けたとき",
  schedule: "決まった時刻に",
};

/** What a step can do. Matches the engine's action kinds. */
export const ACTION_TYPES = [
  "send_message",
  "send_dm",
  "call_webhook",
  "request_approval",
  "add_reaction",
  "set_channel_topic",
  "delay",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_LABELS: Record<ActionType, string> = {
  send_message: "メッセージを送る",
  send_dm: "DMを送る",
  call_webhook: "Webhook を呼ぶ",
  request_approval: "承認を求める",
  add_reaction: "リアクションを付ける",
  set_channel_topic: "トピックを変える",
  delay: "待つ",
};

export interface TriggerForm {
  on: TriggerType;
  /** `message_posted` / `diff_posted`: which channel or pattern. */
  filter: string;
  /** `reaction_added`: which emoji. */
  emoji: string;
  /** `schedule`: a cron expression. */
  cron: string;
}

export interface StepForm {
  id: string;
  name: string;
  action: ActionType;
  /** An evalexpr guard. Empty means the step always runs. */
  condition: string;
  /** `send_message` / `send_dm`: the body. */
  text: string;
  /** `send_message` / `set_channel_topic`: where. */
  channel: string;
  /** `send_dm`: whose. */
  to: string;
  /** `request_approval`: who decides, and what they are shown. */
  from: string;
  message: string;
  /** `call_webhook`: where and how. */
  url: string;
  method: string;
  /** `add_reaction`: which emoji. */
  emoji: string;
  /** `set_channel_topic`: the new topic. */
  topic: string;
  /** `delay`: how long, e.g. `30s`, `5m`. */
  duration: string;
}

export interface WorkflowForm {
  name: string;
  description: string;
  enabled: boolean;
  trigger: TriggerForm;
  steps: StepForm[];
}

export function emptyTrigger(): TriggerForm {
  return { on: "message_posted", filter: "", emoji: "", cron: "" };
}

/**
 * A blank step.
 *
 * Ids are caller-supplied rather than generated here, because this module is pure
 * and a `Math.random()` inside it would make every test that touches it depend on
 * a clock.
 */
export function emptyStep(id: string): StepForm {
  return {
    id,
    name: "",
    action: "send_message",
    condition: "",
    text: "",
    channel: "",
    to: "",
    from: "",
    message: "",
    url: "",
    method: "POST",
    emoji: "",
    topic: "",
    duration: "",
  };
}

export function emptyWorkflowForm(): WorkflowForm {
  return {
    name: "",
    description: "",
    enabled: true,
    trigger: emptyTrigger(),
    steps: [],
  };
}

/** Which of a trigger's fields this trigger type actually uses. */
export function triggerFields(on: TriggerType): Array<keyof TriggerForm> {
  switch (on) {
    case "message_posted":
    case "diff_posted":
      return ["filter"];
    case "reaction_added":
      return ["emoji"];
    case "schedule":
      return ["cron"];
    // A webhook needs nothing configured here — the relay allocates the URL.
    case "webhook":
      return [];
  }
}

/** Which of a step's fields this action uses, in the order they should appear. */
export function stepFields(action: ActionType): Array<keyof StepForm> {
  switch (action) {
    case "send_message":
      return ["channel", "text"];
    case "send_dm":
      return ["to", "text"];
    case "call_webhook":
      return ["url", "method"];
    // `from` and `message` rather than a single body: the engine's
    // `ActionDef::RequestApproval` requires both, and a definition carrying only
    // a body is one the workflow engine refuses to load.
    case "request_approval":
      return ["from", "message"];
    case "add_reaction":
      return ["emoji"];
    case "set_channel_topic":
      return ["channel", "topic"];
    case "delay":
      return ["duration"];
  }
}

/** The fields an action cannot run without. */
const REQUIRED_BY_ACTION: Record<ActionType, Array<keyof StepForm>> = {
  send_message: ["text"],
  send_dm: ["to", "text"],
  call_webhook: ["url"],
  request_approval: ["from", "message"],
  add_reaction: ["emoji"],
  set_channel_topic: ["topic"],
  delay: ["duration"],
};

export const FIELD_LABELS: Record<string, string> = {
  filter: "対象",
  emoji: "絵文字",
  cron: "cron 式",
  channel: "チャンネル",
  text: "本文",
  to: "相手",
  from: "承認者",
  message: "承認を求める文面",
  url: "URL",
  method: "メソッド",
  topic: "トピック",
  duration: "長さ",
};

export interface FormProblem {
  /** Null for a problem with the workflow itself rather than a step. */
  stepId: string | null;
  message: string;
}

/** `30s`, `5m`, `2h` — what the engine accepts for a delay. */
const DURATION_PATTERN = /^\d+(s|m|h)$/;

/**
 * Everything wrong with this form.
 *
 * A list rather than the first problem, so the dialog can mark every incomplete
 * step at once. Someone who filled in four steps and missed a field in the second
 * should not have to submit four times to find that out.
 */
export function validateWorkflowForm(form: WorkflowForm): FormProblem[] {
  const problems: FormProblem[] = [];

  if (!form.name.trim()) {
    problems.push({ stepId: null, message: "名前を入力してください。" });
  }
  if (form.trigger.on === "schedule" && !form.trigger.cron.trim()) {
    problems.push({ stepId: null, message: "cron 式を入力してください。" });
  }
  if (form.trigger.on === "reaction_added" && !form.trigger.emoji.trim()) {
    problems.push({ stepId: null, message: "絵文字を選んでください。" });
  }
  // A workflow with no steps is a trigger that fires and does nothing. The engine
  // would accept it; there is no reason for a person to want it.
  if (form.steps.length === 0) {
    problems.push({
      stepId: null,
      message: "ステップを1つ以上追加してください。",
    });
  }

  for (const [index, step] of form.steps.entries()) {
    const position = step.name.trim() || `${index + 1} 番目のステップ`;
    for (const field of REQUIRED_BY_ACTION[step.action]) {
      if (!String(step[field]).trim()) {
        problems.push({
          stepId: step.id,
          message: `${position}: ${FIELD_LABELS[field] ?? field}を入力してください。`,
        });
      }
    }
    if (step.action === "delay" && step.duration.trim()) {
      if (!DURATION_PATTERN.test(step.duration.trim())) {
        problems.push({
          stepId: step.id,
          message: `${position}: 長さは 30s、5m、2h のように書いてください。`,
        });
      }
    }
  }

  return problems;
}

export function canSaveWorkflow(form: WorkflowForm): boolean {
  return validateWorkflowForm(form).length === 0;
}

/** Move a step up or down, returning a new list. */
export function moveStep(
  steps: StepForm[],
  index: number,
  delta: -1 | 1,
): StepForm[] {
  const target = index + delta;
  if (
    index < 0 ||
    index >= steps.length ||
    target < 0 ||
    target >= steps.length
  ) {
    return steps;
  }
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * The definition this form describes, as the engine's YAML.
 *
 * Hand-written rather than via a YAML library, because the shape is bounded and
 * adding a dependency to render a preview is a poor trade. Values are quoted when
 * they could otherwise be read as something else — a cron expression starting with
 * `*` is the case that actually bites.
 */
export function toWorkflowYaml(form: WorkflowForm): string {
  const lines: string[] = [];
  lines.push(`name: ${quote(form.name)}`);
  if (form.description.trim()) {
    lines.push(`description: ${quote(form.description)}`);
  }
  lines.push(`enabled: ${form.enabled}`);
  lines.push("trigger:");
  lines.push(`  on: ${form.trigger.on}`);
  for (const field of triggerFields(form.trigger.on)) {
    const value = String(form.trigger[field]).trim();
    if (value) lines.push(`  ${field}: ${quote(value)}`);
  }
  lines.push("steps:");
  const takenIds = new Set<string>();
  for (const [index, step] of form.steps.entries()) {
    lines.push(`  - id: ${engineStepId(step.id, index, takenIds)}`);
    lines.push(`    action: ${step.action}`);
    if (step.name.trim()) lines.push(`    name: ${quote(step.name)}`);
    if (step.condition.trim()) {
      lines.push(`    if: ${quote(step.condition)}`);
    }
    for (const field of stepFields(step.action)) {
      const value = String(step[field]).trim();
      if (value) lines.push(`    ${field}: ${quote(value)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * A step id the engine will accept.
 *
 * `Step.id` is required, must be unique within the definition, and may only hold
 * ASCII alphanumerics and underscores (`nuxx-workflow/src/schema.rs`). The form's
 * ids come from the mock id source and carry hyphens, so they are normalized here
 * rather than constrained at the source: the dialog uses them as React keys, and
 * what React needs and what the engine accepts are not the same requirement.
 */
function engineStepId(raw: string, index: number, taken: Set<string>): string {
  const fallback = `step_${index + 1}`;
  const base =
    raw.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) {
    id = `${base}_${suffix}`;
  }
  taken.add(id);
  return id;
}

/**
 * Quote a scalar when YAML would otherwise misread it.
 *
 * Anything that is not plainly a word gets quoted. Over-quoting is harmless;
 * under-quoting is not — a cron expression begins with an asterisk, which YAML
 * reads as the start of an alias reference, and the definition fails to parse.
 */
function quote(value: string): string {
  if (/^[\w.\-/]+$/.test(value)) return value;
  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

/** A one-line summary of the trigger, for a list row. */
export function triggerSummary(trigger: TriggerForm): string {
  const label = TRIGGER_LABELS[trigger.on];
  const detail = triggerFields(trigger.on)
    .map((field) => String(trigger[field]).trim())
    .filter(Boolean)
    .join(" ");
  return detail ? `${label} · ${detail}` : label;
}
