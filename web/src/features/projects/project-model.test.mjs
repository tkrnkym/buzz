import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDiffStat,
  formatDivergence,
  isOpenState,
  ITEM_STATE_LABELS,
  openCounts,
  sortActivity,
  sortProjects,
} from "./project-model.ts";

test("every item state has a label", () => {
  for (const state of ["open", "in_review", "merged", "closed"]) {
    assert.equal(typeof ITEM_STATE_LABELS[state], "string");
  }
});

test("open and in-review still need someone", () => {
  assert.equal(isOpenState("open"), true);
  assert.equal(isOpenState("in_review"), true);
  assert.equal(isOpenState("merged"), false);
  assert.equal(isOpenState("closed"), false);
});

test("a diff reads as a pair of signed counts", () => {
  assert.equal(formatDiffStat(412, 188), "+412 −188");
});

test("a branch level with its base says so in words", () => {
  // "0 ahead, 0 behind" makes the reader do the arithmetic.
  assert.equal(formatDivergence(0, 0), "同期済み");
});

test("divergence names only the non-zero directions", () => {
  assert.equal(formatDivergence(6, 0), "6 進んでいます");
  assert.equal(formatDivergence(0, 4), "4 遅れています");
  assert.equal(formatDivergence(6, 1), "6 進んでいます、1 遅れています");
});

test("activity is newest first", () => {
  const sorted = sortActivity([
    { id: "old", at: 1 },
    { id: "new", at: 9 },
  ]);
  assert.deepEqual(
    sorted.map((entry) => entry.id),
    ["new", "old"],
  );
});

test("projects are ordered by their last movement", () => {
  const sorted = sortProjects([
    { id: "stale", updatedAt: 1 },
    { id: "busy", updatedAt: 9 },
  ]);
  assert.deepEqual(
    sorted.map((project) => project.id),
    ["busy", "stale"],
  );
});

test("open counts come from the items, not a stored number", () => {
  const counts = openCounts({
    issues: [{ state: "open" }, { state: "closed" }, { state: "open" }],
    pullRequests: [{ state: "in_review" }, { state: "merged" }],
  });
  assert.deepEqual(counts, { issues: 2, pullRequests: 1 });
});
