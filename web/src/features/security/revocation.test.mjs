import assert from "node:assert/strict";
import test from "node:test";

import {
  actionableAdvisories,
  affectsIndependentFork,
  blocksExecution,
  isActionable,
  isStale,
  requiresLiveRegistry,
  requiresQuarantine,
  REVOCATION_LABELS,
  STALENESS_IS_PROVISIONAL,
  STALENESS_RULES,
  staysDiscoverable,
} from "@/features/security/revocation";

const HOUR = 3_600;
const DAY = 24 * HOUR;

const advisory = (overrides = {}) => ({
  id: "adv-1",
  target: "agent://reviewer@1.4.0",
  state: "revoked",
  issuedAt: 1000,
  signatureValid: true,
  critical: false,
  ...overrides,
});

test("only a revocation stops something being used", () => {
  // superseded and deprecated are notices about the future; treating them as
  // blocking would break working deployments the day a new version shipped.
  assert.equal(blocksExecution("revoked"), true);
  assert.equal(blocksExecution("superseded"), false);
  assert.equal(blocksExecution("deprecated"), false);
  assert.equal(blocksExecution("active"), false);
});

test("a revoked resource leaves search and cache; the others stay", () => {
  assert.equal(staysDiscoverable("revoked"), false);
  for (const state of ["active", "superseded", "deprecated"]) {
    assert.equal(staysDiscoverable(state), true, state);
  }
});

test("every state says what it means in the reader's terms", () => {
  for (const state of ["active", "superseded", "deprecated", "revoked"]) {
    assert.ok(REVOCATION_LABELS[state]);
  }
});

test("an independent fork is never auto-deleted", () => {
  // The signature withdraws the publisher's own copy. Reaching into a fork
  // would let a registry act on deployments it does not own.
  assert.equal(affectsIndependentFork(), false);
});

test("an unsigned advisory is ignored entirely", () => {
  // Acting on one would let anyone who can reach the instance disable anything
  // on it — a denial of service with extra steps.
  assert.equal(isActionable(advisory({ signatureValid: false })), false);
  assert.equal(isActionable(advisory()), true);
});

test("unverified advisories are dropped, not surfaced as unknown", () => {
  const list = [
    advisory({ id: "ok" }),
    advisory({ id: "forged", signatureValid: false }),
  ];
  assert.deepEqual(
    actionableAdvisories(list).map((row) => row.id),
    ["ok"],
  );
});

test("a critical revocation is quarantined, an ordinary one only delisted", () => {
  assert.equal(requiresQuarantine(advisory({ critical: true })), true);
  assert.equal(requiresQuarantine(advisory({ critical: false })), false);
  // Critical but not revoked is still just a notice.
  assert.equal(
    requiresQuarantine(advisory({ critical: true, state: "deprecated" })),
    false,
  );
  // And a forged one is quarantined by nobody.
  assert.equal(
    requiresQuarantine(advisory({ critical: true, signatureValid: false })),
    false,
  );
});

test("staying current does not require a live registry", () => {
  // A design that required connectivity would leave the most isolated
  // deployments running revoked code.
  assert.equal(requiresLiveRegistry(), false);
});

test("the staleness rule is marked as an undecided proposal", () => {
  // Presenting an open question as settled policy is how a placeholder becomes
  // the answer by default.
  assert.equal(STALENESS_IS_PROVISIONAL, true);
});

test("the stricter the edition, the sooner its data is called stale", () => {
  const byEdition = Object.fromEntries(
    STALENESS_RULES.map((rule) => [rule.edition, rule.maxAgeSeconds]),
  );
  assert.equal(byEdition.saas, HOUR);
  assert.equal(byEdition.enterprise, DAY);
  assert.equal(byEdition.community, 7 * DAY);
  assert.ok(byEdition.saas < byEdition.enterprise);
  assert.ok(byEdition.enterprise < byEdition.community);
});

test("staleness is measured from the last successful fetch", () => {
  const saas = STALENESS_RULES.find((rule) => rule.edition === "saas");
  assert.equal(isStale(saas, 0, HOUR), false);
  assert.equal(isStale(saas, 0, HOUR + 1), true);
});

test("only Community Edition merely warns when data goes stale", () => {
  const bySeverity = Object.fromEntries(
    STALENESS_RULES.map((rule) => [rule.edition, rule.onStale]),
  );
  assert.equal(bySeverity.saas, "block-new-registry-runs");
  assert.equal(bySeverity.enterprise, "block-high-risk");
  assert.equal(bySeverity.community, "warn");
});
