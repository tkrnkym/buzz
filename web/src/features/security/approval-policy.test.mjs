import assert from "node:assert/strict";
import test from "node:test";

import {
  canResumeExpired,
  DEFAULT_DEADLINES,
  effectiveDeadlineSeconds,
  formatDuration,
  isExpired,
  isTightening,
  resolveApprovalState,
  RISK_CLASSES,
  secondsRemaining,
} from "@/features/security/approval-policy";

const HOUR = 3_600;
const DAY = 24 * HOUR;

const request = (overrides = {}) => ({
  id: "ap-1",
  risk: "standard",
  requestedAt: 0,
  state: "pending",
  policyVersion: 3,
  ...overrides,
});

test("the defaults are the ones the policy states", () => {
  assert.equal(DEFAULT_DEADLINES.standard, 7 * DAY);
  assert.equal(DEFAULT_DEADLINES["external-send"], DAY);
  assert.equal(DEFAULT_DEADLINES["production-change"], DAY);
  assert.equal(DEFAULT_DEADLINES.destructive, HOUR);
});

test("riskier operations never wait longer than safer ones", () => {
  // The property behind the table: if this inverts, the table is wrong however
  // plausible each row looks on its own.
  const ordered = RISK_CLASSES.map((risk) => risk.defaultSeconds);
  assert.equal(ordered[0], Math.max(...ordered));
  assert.equal(
    DEFAULT_DEADLINES.destructive,
    Math.min(...Object.values(DEFAULT_DEADLINES)),
  );
});

test("an override may tighten but not widen", () => {
  assert.equal(isTightening(7 * DAY, DAY), true);
  assert.equal(isTightening(7 * DAY, 7 * DAY), true);
  assert.equal(isTightening(DAY, 7 * DAY), false);
  // Zero or negative is not "no deadline", it is nonsense.
  assert.equal(isTightening(DAY, 0), false);
  assert.equal(isTightening(DAY, -1), false);
});

test("a widening override is ignored rather than applied", () => {
  // Letting a workflow widen its own window lets the governed rewrite the
  // governance.
  assert.equal(effectiveDeadlineSeconds(DAY, 7 * DAY), DAY);
  assert.equal(effectiveDeadlineSeconds(DAY, HOUR), HOUR);
  assert.equal(effectiveDeadlineSeconds(DAY), DAY);
});

test("a pending request expires once its deadline passes", () => {
  const destructive = request({ risk: "destructive" });
  assert.equal(isExpired(destructive, DEFAULT_DEADLINES, HOUR - 1), false);
  assert.equal(isExpired(destructive, DEFAULT_DEADLINES, HOUR), true);
});

test("a resolved decision does not expire retroactively", () => {
  for (const state of ["approved", "rejected"]) {
    assert.equal(
      isExpired(request({ state }), DEFAULT_DEADLINES, 999 * DAY),
      false,
    );
    assert.equal(
      resolveApprovalState(request({ state }), DEFAULT_DEADLINES, 999 * DAY),
      state,
    );
  }
});

test("expiry is derived, so nothing has to sweep the list", () => {
  // A stored flag would leave a stale row claiming to be pending because no job
  // ran.
  assert.equal(
    resolveApprovalState(
      request({ risk: "destructive" }),
      DEFAULT_DEADLINES,
      2 * HOUR,
    ),
    "expired",
  );
});

test("the remaining time never goes negative", () => {
  const row = request({ risk: "destructive" });
  assert.equal(secondsRemaining(row, DEFAULT_DEADLINES, 0), HOUR);
  assert.equal(secondsRemaining(row, DEFAULT_DEADLINES, HOUR / 2), HOUR / 2);
  assert.equal(secondsRemaining(row, DEFAULT_DEADLINES, 99 * HOUR), 0);
});

test("an expired request is never simply resumed", () => {
  // The pinned policy and the capabilities may both have changed; continuing on
  // the old ones is how a revoked permission gets used anyway.
  assert.equal(canResumeExpired(), false);
});

test("a request is pinned to the policy version it started under", () => {
  assert.equal(request().policyVersion, 3);
});

test("durations read in the largest whole unit", () => {
  assert.equal(formatDuration(7 * DAY), "7日");
  assert.equal(formatDuration(DAY), "1日");
  assert.equal(formatDuration(HOUR), "1時間");
  assert.equal(formatDuration(12 * 60), "12分");
  assert.equal(formatDuration(0), "0分");
});
