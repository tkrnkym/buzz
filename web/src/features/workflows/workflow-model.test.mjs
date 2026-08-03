import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDuration,
  latestRun,
  RUN_STATE_LABELS,
  sortWorkflows,
  stoppedAtIndex,
  totalPendingApprovals,
} from "./workflow-model.ts";

const step = (state) => ({
  id: state,
  name: state,
  action: "run",
  condition: null,
  state,
  durationMs: 0,
});

test("every run state has a label", () => {
  for (const state of ["succeeded", "failed", "running", "waiting"]) {
    assert.equal(typeof RUN_STATE_LABELS[state], "string");
  }
});

test("the latest run is the most recently started", () => {
  const run = latestRun({
    runs: [
      { id: "old", startedAt: 1 },
      { id: "new", startedAt: 9 },
    ],
  });
  assert.equal(run.id, "new");
});

test("a workflow that has never run has no latest run", () => {
  assert.equal(latestRun({ runs: [] }), null);
});

test("a run stops at its first unfinished step", () => {
  // Pointing at the last finished step would say the run got further than it
  // did whenever a failure is followed by skipped steps.
  assert.equal(
    stoppedAtIndex({
      steps: [step("succeeded"), step("failed"), step("waiting")],
    }),
    1,
  );
});

test("a run that finished stopped nowhere", () => {
  assert.equal(
    stoppedAtIndex({ steps: [step("succeeded"), step("succeeded")] }),
    null,
  );
});

test("durations read in minutes and seconds", () => {
  assert.equal(formatDuration(4_200), "4秒");
  assert.equal(formatDuration(96_400), "1分36秒");
  assert.equal(formatDuration(120_000), "2分");
});

test("an unfinished run has no duration to show", () => {
  assert.equal(formatDuration(null), "—");
});

test("disabled workflows sink, waiting ones rise", () => {
  const sorted = sortWorkflows([
    { name: "off", enabled: false, pendingApprovals: 0 },
    { name: "quiet", enabled: true, pendingApprovals: 0 },
    { name: "waiting", enabled: true, pendingApprovals: 2 },
  ]);
  assert.deepEqual(
    sorted.map((w) => w.name),
    ["waiting", "quiet", "off"],
  );
});

test("pending approvals add up across workflows", () => {
  assert.equal(
    totalPendingApprovals([
      { pendingApprovals: 1 },
      { pendingApprovals: 0 },
      { pendingApprovals: 2 },
    ]),
    3,
  );
});
