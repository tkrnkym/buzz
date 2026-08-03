/**
 * Turning the workflow builder's form into a fixture row, and back.
 *
 * A separate file from the form model because these two conversions are the only
 * places the demo's `ShowcaseWorkflow` shape and the builder's `WorkflowForm`
 * shape meet. When workflows get a relay path, this is what gets replaced — the
 * form model and the dialog above it do not have to change.
 */

import type { Showcase, ShowcaseWorkflow, WorkflowRun } from "@/mock/showcase";
import {
  ACTION_LABELS,
  emptyStep,
  type StepForm,
  TRIGGER_LABELS,
  triggerSummary,
  type WorkflowForm,
} from "@/features/workflows/workflow-form";

/** The fixture row a completed form describes. */
export function workflowFromForm(
  form: WorkflowForm,
  id: string,
  existing?: ShowcaseWorkflow,
): ShowcaseWorkflow {
  return {
    id,
    name: form.name.trim(),
    description: form.description.trim(),
    trigger: form.trigger.on,
    triggerDetail: triggerSummary(form.trigger),
    enabled: form.enabled,
    // The channel a workflow acts in is the first step that names one, since
    // that is what the reader will see it doing.
    channel:
      form.steps
        .find((step) => step.channel.trim())
        ?.channel.trim()
        .replace(/^#/, "") ??
      existing?.channel ??
      "general",
    // History belongs to the workflow, not the form: editing a definition does not
    // undo what it already did.
    lastRun: existing?.lastRun ?? null,
    runs: existing?.runs ?? [],
    pendingApprovals: existing?.pendingApprovals ?? 0,
  };
}

/**
 * The form for editing an existing workflow.
 *
 * Its steps come from the last run rather than from a stored definition, because
 * the fixture shape only ever recorded what ran. That is a real limit of editing
 * a demo row and the reason a freshly seeded workflow opens with its steps
 * approximated from its history — stated here rather than hidden behind a form
 * that looks authoritative.
 */
export function formFromWorkflow(workflow: ShowcaseWorkflow): WorkflowForm {
  const source = workflow.lastRun ?? workflow.runs[0] ?? null;
  const steps: StepForm[] = (source?.steps ?? []).map((step, index) => ({
    ...emptyStep(`${workflow.id}-step-${index}`),
    name: step.name,
    // A run's action strings are the engine's, and the ones the fixtures use
    // ("run", "post") are not in the builder's list — so anything unrecognized
    // falls back to the commonest action rather than to an empty select.
    action:
      step.action in ACTION_LABELS
        ? (step.action as StepForm["action"])
        : "send_message",
    condition: step.condition ?? "",
    text: step.name,
    channel: workflow.channel,
  }));

  return {
    name: workflow.name,
    description: workflow.description,
    enabled: workflow.enabled,
    trigger: {
      on:
        workflow.trigger in TRIGGER_LABELS
          ? (workflow.trigger as WorkflowForm["trigger"]["on"])
          : "webhook",
      filter: "",
      emoji: "",
      cron: workflow.trigger === "schedule" ? workflow.triggerDetail : "",
    },
    steps,
  };
}

export function addWorkflow(
  current: Showcase,
  workflow: ShowcaseWorkflow,
): Showcase {
  return { ...current, workflows: [...current.workflows, workflow] };
}

export function replaceWorkflow(
  current: Showcase,
  workflow: ShowcaseWorkflow,
): Showcase {
  return {
    ...current,
    workflows: current.workflows.map((row) =>
      row.id === workflow.id ? workflow : row,
    ),
  };
}

export function removeWorkflow(current: Showcase, id: string): Showcase {
  return {
    ...current,
    workflows: current.workflows.filter((row) => row.id !== id),
  };
}

export function setWorkflowEnabled(
  current: Showcase,
  id: string,
  enabled: boolean,
): Showcase {
  return {
    ...current,
    workflows: current.workflows.map((row) =>
      row.id === id ? { ...row, enabled } : row,
    ),
  };
}

/**
 * Record a decision on a run that was waiting.
 *
 * Approving resumes it, so every waiting step becomes succeeded and the run does
 * too. Rejecting stops it: the waiting step fails and the rest stay where they
 * were, which is what the trace should show — a rejected run did not silently
 * complete.
 */
export function resolveApproval(
  current: Showcase,
  workflowId: string,
  runId: string,
  decision: "approve" | "reject",
): Showcase {
  const decide = (run: WorkflowRun): WorkflowRun => {
    if (run.id !== runId) return run;
    return {
      ...run,
      state: decision === "approve" ? "succeeded" : "failed",
      steps: run.steps.map((step) =>
        step.state === "waiting"
          ? { ...step, state: decision === "approve" ? "succeeded" : "failed" }
          : step,
      ),
    };
  };

  return {
    ...current,
    workflows: current.workflows.map((workflow) => {
      if (workflow.id !== workflowId) return workflow;
      return {
        ...workflow,
        lastRun: workflow.lastRun ? decide(workflow.lastRun) : null,
        runs: workflow.runs.map(decide),
        pendingApprovals: Math.max(0, workflow.pendingApprovals - 1),
      };
    }),
  };
}
