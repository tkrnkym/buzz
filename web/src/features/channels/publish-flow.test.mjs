import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAuditEntry,
  canAdvance,
  canPublish,
  findingsSummary,
  nextStep,
  PUBLISH_STEPS,
} from "@/features/channels/publish-flow";

const state = (overrides = {}) => ({
  step: "preview",
  decision: "clear",
  reauthenticated: false,
  acknowledged: false,
  ...overrides,
});

const finding = (severity, id = "f1") => ({
  id,
  severity,
  kind: severity === "blocking" ? "API キー" : "メールアドレス",
  where: "msg-1",
  excerpt: "sk-●●●●●●●●",
});

test("the reader sees the scope before being asked anything", () => {
  assert.equal(PUBLISH_STEPS[0], "preview");
  assert.ok(
    PUBLISH_STEPS.indexOf("findings") < PUBLISH_STEPS.indexOf("confirm"),
    "the scan must run before the confirmation",
  );
});

test("a blocking finding stops the flow and cannot be pushed past", () => {
  const blocked = state({ step: "findings", decision: "blocked" });
  assert.equal(canAdvance(blocked), false);
  assert.equal(nextStep(blocked), null);

  // Not even with everything else satisfied — this is a refusal, not a warning.
  assert.equal(
    canPublish({
      ...blocked,
      step: "confirm",
      acknowledged: true,
      reauthenticated: true,
    }),
    false,
  );
});

test("contextual warnings advance only once acknowledged", () => {
  const pending = state({
    step: "findings",
    decision: "needs-confirmation",
  });
  assert.equal(canAdvance(pending), false);
  assert.equal(canAdvance({ ...pending, acknowledged: true }), true);
});

test("a clean scan needs no acknowledgement", () => {
  assert.equal(
    canAdvance(state({ step: "findings", decision: "clear" })),
    true,
  );
});

test("publishing requires re-authentication", () => {
  const ready = state({ step: "confirm", decision: "clear" });
  assert.equal(canPublish(ready), false);
  assert.equal(canPublish({ ...ready, reauthenticated: true }), true);
});

test("re-authentication alone does not clear the warnings gate", () => {
  // Both are required, and neither substitutes for the other.
  assert.equal(
    canPublish(
      state({
        step: "confirm",
        decision: "needs-confirmation",
        reauthenticated: true,
      }),
    ),
    false,
  );
  assert.equal(
    canPublish(
      state({
        step: "confirm",
        decision: "needs-confirmation",
        reauthenticated: true,
        acknowledged: true,
      }),
    ),
    true,
  );
});

test("the flow ends rather than looping", () => {
  const done = state({ step: "done", decision: "clear" });
  assert.equal(canAdvance(done), false);
  assert.equal(nextStep(done), null);
});

test("there is no waiting step between confirming and taking effect", () => {
  // "追加承認や待機期間は設けず、最終確認直後に反映する" — confirm is the last
  // gate, so a step inserted after it would be a change in policy, not layout.
  assert.equal(PUBLISH_STEPS.at(-1), "done");
  assert.equal(PUBLISH_STEPS.at(-2), "confirm");
});

test("the blocked message says what to do, not which rule fired", () => {
  const message = findingsSummary("blocked", [
    finding("blocking"),
    finding("warning", "f2"),
  ]);
  assert.match(message, /公開できません/);
  // The count is of blocking findings — the warning alongside is not what stops
  // it, and saying "2件" here would send the reader looking for the wrong thing.
  assert.match(message, /1 件/);
});

test("the audit entry records who, not just what", () => {
  const entry = buildAuditEntry({
    actorPubkey: "a".repeat(64),
    at: 1000,
    channelId: "c1",
    channelName: "incident",
    findings: [
      finding("warning"),
      finding("warning", "f2"),
      finding("blocking"),
    ],
  });
  assert.equal(entry.actorPubkey, "a".repeat(64));
  assert.equal(entry.channelName, "incident");
  assert.equal(entry.at, 1000);
  // Warnings only: a blocking finding means this never published at all.
  assert.equal(entry.acknowledgedWarnings, 2);
});
