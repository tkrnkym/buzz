import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_STATUS_LABELS,
  formatRelativeTime,
  groupAgentsByChannel,
  sortAgents,
  workingCount,
} from "./agent-model.ts";

const agent = (overrides) => ({
  id: "a",
  pubkey: "a".repeat(64),
  name: "A",
  purpose: "",
  harness: "sprig",
  model: "claude-opus-5",
  status: "idle",
  channels: [],
  activity: null,
  lastActiveAt: 100,
  ownerPubkey: "b".repeat(64),
  turnsToday: 0,
  ...overrides,
});

test("every status has a label", () => {
  for (const status of ["working", "idle", "paused", "error"]) {
    assert.equal(typeof AGENT_STATUS_LABELS[status], "string");
  }
});

test("errors sort above everything", () => {
  // The one state a reader has to act on; buried under "working" it goes
  // unnoticed for a day.
  const sorted = sortAgents([
    agent({ id: "w", status: "working", lastActiveAt: 900 }),
    agent({ id: "e", status: "error", lastActiveAt: 1 }),
  ]);
  assert.deepEqual(
    sorted.map((a) => a.id),
    ["e", "w"],
  );
});

test("within a status the most recent comes first", () => {
  const sorted = sortAgents([
    agent({ id: "old", status: "idle", lastActiveAt: 100 }),
    agent({ id: "new", status: "idle", lastActiveAt: 900 }),
  ]);
  assert.deepEqual(
    sorted.map((a) => a.id),
    ["new", "old"],
  );
});

test("an agent in two channels appears under both", () => {
  const groups = groupAgentsByChannel([
    agent({ id: "both", channels: ["dev", "general"] }),
    agent({ id: "one", channels: ["dev"] }),
  ]);
  assert.deepEqual(
    groups.map((g) => g.channel),
    ["dev", "general"],
  );
  assert.equal(groups[0].agents.length, 2);
  assert.equal(groups[1].agents.length, 1);
});

test("an agent in no channel is in no group", () => {
  assert.deepEqual(groupAgentsByChannel([agent({ channels: [] })]), []);
});

test("working counts only the working", () => {
  assert.equal(
    workingCount([
      agent({ status: "working" }),
      agent({ status: "error" }),
      agent({ status: "working" }),
    ]),
    2,
  );
});

test("relative time is coarse past an hour", () => {
  const now = 100_000;
  assert.equal(formatRelativeTime(now - 30, now), "たった今");
  assert.equal(formatRelativeTime(now - 120, now), "2分前");
  assert.equal(formatRelativeTime(now - 7_200, now), "2時間前");
  assert.equal(formatRelativeTime(now - 86_400 * 3, now), "3日前");
});

test("a future timestamp does not read as negative", () => {
  assert.equal(formatRelativeTime(200, 100), "たった今");
});
