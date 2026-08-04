import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyStep,
  emptyWorkflowForm,
} from "@/features/workflows/workflow-form";
import {
  formFromWorkflow,
  workflowFromForm,
} from "@/features/workflows/workflow-mutations";

/** A completed form, as the dialog would submit it. */
function submittedForm() {
  return {
    ...emptyWorkflowForm(),
    name: "リリース前チェック",
    description: "毎週の確認",
    trigger: { on: "schedule", filter: "", emoji: "", cron: "0 10 * * 5" },
    steps: [
      { ...emptyStep("step-1"), name: "知らせる", text: "確認をお願いします" },
      {
        ...emptyStep("step-2"),
        action: "request_approval",
        from: "@release-manager",
        message: "リリースしてよいですか",
      },
    ],
  };
}

test("a workflow built here reopens with the steps that were entered", () => {
  // The bug this guards: the row stored only summary fields, so reopening a
  // just-created workflow showed zero steps and could not be saved until the
  // reader rebuilt it from nothing.
  const form = submittedForm();
  const reopened = formFromWorkflow(workflowFromForm(form, "w-new"));

  assert.equal(reopened.name, form.name);
  assert.equal(reopened.description, form.description);
  assert.deepEqual(reopened.trigger, form.trigger);
  assert.deepEqual(reopened.steps, form.steps);
});

test("editing a workflow keeps the edit and not the previous definition", () => {
  const first = workflowFromForm(submittedForm(), "w-new");
  const edited = {
    ...submittedForm(),
    steps: [{ ...emptyStep("step-1"), text: "変えました" }],
  };

  const reopened = formFromWorkflow(workflowFromForm(edited, "w-new", first));
  assert.equal(reopened.steps.length, 1);
  assert.equal(reopened.steps[0].text, "変えました");
});

test("the stored definition does not alias the form the dialog keeps editing", () => {
  const form = submittedForm();
  const row = workflowFromForm(form, "w-new");
  form.steps[0].text = "あとで書き換えた";
  form.trigger.cron = "0 0 * * 1";

  assert.equal(row.definition.steps[0].text, "確認をお願いします");
  assert.equal(row.definition.trigger.cron, "0 10 * * 5");
});

test("a seeded row still opens with its steps approximated from history", () => {
  // Fixtures only ever recorded what ran, so there is no definition to restore.
  // That approximation is the fallback, not the rule.
  const seeded = {
    id: "w-seeded",
    name: "既存",
    description: "",
    trigger: "webhook",
    triggerDetail: "",
    enabled: true,
    channel: "dev",
    lastRun: {
      id: "r1",
      status: "success",
      at: 100,
      steps: [{ name: "post", action: "post", status: "success" }],
    },
    runs: [],
    pendingApprovals: 0,
  };

  const form = formFromWorkflow(seeded);
  assert.equal(form.steps.length, 1);
  assert.equal(form.steps[0].name, "post");
  // An action the builder does not know falls back rather than opening an empty
  // select.
  assert.equal(form.steps[0].action, "send_message");
});
