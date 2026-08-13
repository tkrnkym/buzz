import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluationConfidence,
  evaluationKey,
  formatEvaluationScore,
  groupEvaluationsBySource,
  PROVISIONAL_THRESHOLD,
} from "@/features/agents/evaluation-model";

const result = (overrides = {}) => ({
  source: "publisher",
  dataset: "swe-bench-lite",
  model: "claude-opus-5",
  agentVersion: "1.2.0",
  succeeded: 24,
  total: 30,
  ...overrides,
});

test("nothing attempted is unevaluated, not a zero score", () => {
  assert.equal(evaluationConfidence(0), "unevaluated");
  // "0/0" is not a score; the label is what carries it.
  assert.equal(formatEvaluationScore({ succeeded: 0, total: 0 }), null);
});

test("under thirty attempts is provisional, thirty is not", () => {
  assert.equal(evaluationConfidence(1), "provisional");
  assert.equal(evaluationConfidence(PROVISIONAL_THRESHOLD - 1), "provisional");
  // The threshold itself is established — "30件未満は暫定" is exclusive.
  assert.equal(evaluationConfidence(PROVISIONAL_THRESHOLD), "established");
  assert.equal(evaluationConfidence(400), "established");
});

test("the raw counts survive, so a percentage cannot stand in for them", () => {
  // 14/15 and 373/400 both round to 93%, which is the confusion the rule exists
  // to prevent. The two must not produce the same string.
  const small = formatEvaluationScore({ succeeded: 14, total: 15 });
  const large = formatEvaluationScore({ succeeded: 373, total: 400 });
  assert.equal(small, "14/15");
  assert.equal(large, "373/400");
  assert.notEqual(small, large);
});

test("a score is shown for a tiny sample rather than withheld", () => {
  // "件数にかかわらず成功数／総試行数を表示" — one attempt still prints.
  assert.equal(formatEvaluationScore({ succeeded: 1, total: 1 }), "1/1");
  assert.equal(evaluationConfidence(1), "provisional");
});

test("every axis separates a measurement from another", () => {
  const base = result();
  for (const field of ["source", "dataset", "model", "agentVersion"]) {
    const other = result({ [field]: "other" });
    assert.notEqual(
      evaluationKey(base),
      evaluationKey(other),
      `${field} does not separate two results`,
    );
  }
});

test("results from different sources are never folded together", () => {
  const groups = groupEvaluationsBySource([
    result({ source: "publisher", succeeded: 24, total: 30 }),
    result({ source: "workspace", succeeded: 3, total: 5 }),
    result({ source: "nuxx", succeeded: 18, total: 40 }),
  ]);
  assert.equal(groups.length, 3);
  for (const group of groups) {
    assert.equal(group.results.length, 1);
    // Every row still carries its own totals — nothing was summed on the way.
    assert.equal(group.results[0].source, group.source);
  }
  const totals = groups.flatMap((group) =>
    group.results.map((row) => row.total),
  );
  assert.deepEqual(
    totals.sort((a, b) => a - b),
    [5, 30, 40],
  );
});

test("a source with no results is left out rather than shown empty", () => {
  const groups = groupEvaluationsBySource([result({ source: "publisher" })]);
  assert.deepEqual(
    groups.map((group) => group.source),
    ["publisher"],
  );
});

test("the workspace's own results are listed before the publisher's", () => {
  const groups = groupEvaluationsBySource([
    result({ source: "publisher" }),
    result({ source: "workspace" }),
  ]);
  // A reader trusts their own measurement over the vendor's, so it leads.
  assert.deepEqual(
    groups.map((group) => group.source),
    ["workspace", "publisher"],
  );
});

test("two datasets on one model stay as two rows", () => {
  const groups = groupEvaluationsBySource([
    result({ source: "nuxx", dataset: "a", total: 30 }),
    result({ source: "nuxx", dataset: "b", total: 30 }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].results.length, 2);
});
