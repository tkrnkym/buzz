import assert from "node:assert/strict";
import test from "node:test";

import { buildActionNotifications } from "@/features/notifications/action-notifications";

const NOW = 1_700_000_000;

const run = (overrides = {}) => ({
  id: "run-1",
  state: "waiting",
  startedAt: NOW - 3_600,
  durationMs: 0,
  trigger: "event",
  steps: [],
  ...overrides,
});

const workflow = (overrides = {}) => ({
  id: "wf-1",
  name: "リリースチーム",
  description: "",
  trigger: "event",
  triggerDetail: "",
  enabled: true,
  channel: "release",
  lastRun: null,
  runs: [run()],
  pendingApprovals: 1,
  ...overrides,
});

test("a workflow with nothing pending produces no notification", () => {
  assert.deepEqual(
    buildActionNotifications([workflow({ pendingApprovals: 0 })], NOW),
    [],
  );
});

test("a workflow waiting on approval becomes an action item", () => {
  const [item] = buildActionNotifications([workflow()], NOW);
  assert.equal(item.category, "action");
  assert.equal(item.authorLabel, "リリースチーム");
  assert.equal(item.channelId, null);
  assert.match(item.content, /#release/);
  assert.match(item.content, /1件/);
});

test("the wait is dated from `runs`, not only from `lastRun`", () => {
  // The two are separate fields and `lastRun` is null on rows whose history
  // lives in `runs`. Reading only `lastRun` produced a 0, which the list
  // rendered as "689 months ago" — a missing timestamp nobody noticed, because
  // zero is a valid number.
  const [item] = buildActionNotifications([workflow({ lastRun: null })], NOW);
  assert.equal(item.createdAt, NOW - 3_600);
});

test("the newest run wins when both fields carry one", () => {
  const [item] = buildActionNotifications(
    [
      workflow({
        lastRun: run({ id: "newer", startedAt: NOW - 60 }),
        runs: [run({ startedAt: NOW - 9_000 })],
      }),
    ],
    NOW,
  );
  assert.equal(item.createdAt, NOW - 60);
});

test("a workflow with no run at all is waiting as of now, not since 1970", () => {
  // The epoch fallback put a five-decade-old row at the bottom of a list that
  // sorts by recency, and printed a nonsense age next to it.
  const [item] = buildActionNotifications(
    [workflow({ lastRun: null, runs: [] })],
    NOW,
  );
  assert.equal(item.createdAt, NOW);
});

test("a zero timestamp in the data is not treated as a real date", () => {
  const [item] = buildActionNotifications(
    [workflow({ lastRun: null, runs: [run({ startedAt: 0 })] })],
    NOW,
  );
  assert.equal(item.createdAt, NOW);
});

test("the count is stated, not just that something is pending", () => {
  const [item] = buildActionNotifications(
    [workflow({ pendingApprovals: 3 })],
    NOW,
  );
  assert.match(item.content, /3件/);
});

test("the id is derived from the workflow, so it stays stable across rebuilds", () => {
  const [item] = buildActionNotifications([workflow()], NOW);
  assert.equal(item.id, "action-wf-1");
});
