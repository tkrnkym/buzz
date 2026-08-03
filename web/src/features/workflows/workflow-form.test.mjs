import assert from "node:assert/strict";
import test from "node:test";

import {
  canSaveWorkflow,
  emptyStep,
  emptyWorkflowForm,
  moveStep,
  stepFields,
  toWorkflowYaml,
  triggerFields,
  triggerSummary,
  validateWorkflowForm,
} from "@/features/workflows/workflow-form";

/** A form that saves, as a base for the cases below. */
function validForm(overrides = {}) {
  return {
    ...emptyWorkflowForm(),
    name: "リリース前チェック",
    steps: [{ ...emptyStep("s1"), text: "確認します" }],
    ...overrides,
  };
}

test("a trigger only asks for the fields it uses", () => {
  assert.deepEqual(triggerFields("schedule"), ["cron"]);
  assert.deepEqual(triggerFields("reaction_added"), ["emoji"]);
  assert.deepEqual(triggerFields("message_posted"), ["filter"]);
  // A webhook's URL is allocated by the relay, so there is nothing to ask.
  assert.deepEqual(triggerFields("webhook"), []);
});

test("an action only asks for the fields it uses", () => {
  assert.deepEqual(stepFields("send_message"), ["channel", "text"]);
  assert.deepEqual(stepFields("call_webhook"), ["url", "method"]);
  assert.deepEqual(stepFields("delay"), ["duration"]);
});

test("an empty form names everything it is missing at once", () => {
  const problems = validateWorkflowForm(emptyWorkflowForm());
  // A name and a step, both reported — not just the first.
  assert.equal(problems.length, 2);
  assert.ok(problems.every((problem) => problem.stepId === null));
});

test("a workflow with no steps is refused", () => {
  // The engine would accept a trigger that fires and does nothing; nobody wants
  // one.
  assert.equal(canSaveWorkflow(validForm({ steps: [] })), false);
});

test("a schedule without a cron expression is refused", () => {
  const form = validForm({
    trigger: { on: "schedule", filter: "", emoji: "", cron: "" },
  });
  assert.match(validateWorkflowForm(form)[0].message, /cron/);
});

test("a problem is attributed to the step it is in", () => {
  const form = validForm({
    steps: [
      { ...emptyStep("s1"), text: "ok" },
      { ...emptyStep("s2"), action: "call_webhook", url: "" },
    ],
  });
  const problems = validateWorkflowForm(form);
  assert.equal(problems.length, 1);
  // Attributed, so the dialog can mark that step rather than the whole form.
  assert.equal(problems[0].stepId, "s2");
  assert.match(problems[0].message, /URL/);
});

test("a step's own name is used in its problem, when it has one", () => {
  const form = validForm({
    steps: [{ ...emptyStep("s1"), name: "通知する", text: "" }],
  });
  assert.match(validateWorkflowForm(form)[0].message, /^通知する:/);
});

test("a delay's duration has to be a duration", () => {
  const bad = validForm({
    steps: [{ ...emptyStep("s1"), action: "delay", duration: "しばらく" }],
  });
  assert.match(validateWorkflowForm(bad)[0].message, /30s/);
  const good = validForm({
    steps: [{ ...emptyStep("s1"), action: "delay", duration: "5m" }],
  });
  assert.equal(canSaveWorkflow(good), true);
});

test("a step moves, and cannot move off either end", () => {
  const steps = [emptyStep("a"), emptyStep("b"), emptyStep("c")];
  assert.deepEqual(
    moveStep(steps, 0, 1).map((step) => step.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    moveStep(steps, 2, -1).map((step) => step.id),
    ["a", "c", "b"],
  );
  // Unchanged rather than throwing or wrapping around.
  assert.equal(moveStep(steps, 0, -1), steps);
  assert.equal(moveStep(steps, 2, 1), steps);
});

test("the YAML carries the trigger, the steps, and only the used fields", () => {
  const yaml = toWorkflowYaml(
    validForm({
      description: "毎週の確認",
      trigger: { on: "schedule", filter: "", emoji: "", cron: "0 10 * * 5" },
      steps: [
        {
          ...emptyStep("s1"),
          name: "知らせる",
          channel: "#dev",
          text: "確認をお願いします",
          condition: 'labels contains "release"',
        },
      ],
    }),
  );
  assert.match(yaml, /^name: "リリース前チェック"$/m);
  assert.match(yaml, /^description: "毎週の確認"$/m);
  assert.match(yaml, /^ {2}on: schedule$/m);
  // Quoted, because a cron expression starts with an asterisk which YAML reads as
  // the start of an alias reference.
  assert.match(yaml, /^ {2}cron: "0 10 \* \* 5"$/m);
  assert.match(yaml, /^ {4}if: "labels contains \\"release\\""$/m);
  // A field this action does not use never appears.
  assert.ok(!yaml.includes("duration"));
  assert.ok(!yaml.includes("url:"));
});

test("a trigger's summary names its detail when it has one", () => {
  assert.equal(
    triggerSummary({
      on: "schedule",
      filter: "",
      emoji: "",
      cron: "0 9 * * 1",
    }),
    "決まった時刻に · 0 9 * * 1",
  );
  // Nothing to add for a webhook, so no trailing separator.
  assert.equal(
    triggerSummary({ on: "webhook", filter: "", emoji: "", cron: "" }),
    "Webhook を受けたとき",
  );
});
