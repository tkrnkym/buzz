import assert from "node:assert/strict";
import test from "node:test";

import { buildActionNotifications } from "@/features/notifications/action-notifications";

const workflow = (overrides = {}) => ({
  id: "wf-1",
  name: "リリースチーム",
  description: "",
  trigger: "event",
  triggerDetail: "",
  enabled: true,
  channel: "release",
  lastRun: {
    id: "run-1",
    state: "held",
    startedAt: 1000,
    durationMs: 0,
    trigger: "event",
    steps: [],
  },
  runs: [],
  pendingApprovals: 1,
  ...overrides,
});

test("a workflow with nothing pending produces no notification", () => {
  assert.deepEqual(
    buildActionNotifications([workflow({ pendingApprovals: 0 })]),
    [],
  );
});

test("a workflow waiting on approval becomes an action item", () => {
  const [item] = buildActionNotifications([workflow()]);
  assert.equal(item.category, "action");
  assert.equal(item.authorLabel, "リリースチーム");
  assert.equal(item.channelId, null);
  assert.equal(item.createdAt, 1000);
  assert.match(item.content, /#release/);
  assert.match(item.content, /1件/);
});

test("the count is stated, not just that something is pending", () => {
  const [item] = buildActionNotifications([workflow({ pendingApprovals: 3 })]);
  assert.match(item.content, /3件/);
});

test("the id is derived from the workflow, so it stays stable across rebuilds", () => {
  const [item] = buildActionNotifications([workflow()]);
  assert.equal(item.id, "action-wf-1");
});

test("a workflow with no run yet still produces an item, dated at zero", () => {
  const [item] = buildActionNotifications([workflow({ lastRun: null })]);
  assert.equal(item.createdAt, 0);
});
