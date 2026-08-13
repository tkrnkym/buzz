import assert from "node:assert/strict";
import test from "node:test";

import {
  canQueueOffline,
  canRead,
  evaluateSend,
  indexableDrafts,
  promoteToWorkspace,
  sendsAutomaticallyOnReconnect,
} from "@/features/drafts/offline-draft";

const ME = "a".repeat(64);
const OTHER = "b".repeat(64);

const draft = (overrides = {}) => ({
  id: "d1",
  scope: "device",
  channelId: "c1",
  authorPubkey: ME,
  body: "書きかけ",
  updatedAt: 1000,
  risk: "ordinary",
  ...overrides,
});

const context = (overrides = {}) => ({
  online: true,
  hasPermission: true,
  visibilityChanged: false,
  policyChanged: false,
  ...overrides,
});

test("reconnecting never sends anything by itself", () => {
  // Flushing a queue on reconnect publishes every draft against a world that
  // moved while they were queued, with nobody looking.
  assert.equal(sendsAutomaticallyOnReconnect(), false);
});

test("a high-risk operation cannot be queued offline at all", () => {
  assert.equal(canQueueOffline("ordinary"), true);
  assert.equal(canQueueOffline("high"), false);
});

test("permission is re-checked at send time, not at compose time", () => {
  const verdict = evaluateSend(context({ hasPermission: false }));
  assert.equal(verdict.canSend, false);
  assert.equal(verdict.reason, "no-permission");
});

test("a channel that changed audience while queued blocks the send", () => {
  // The one the author most needs to be told before it goes rather than after.
  const verdict = evaluateSend(context({ visibilityChanged: true }));
  assert.equal(verdict.canSend, false);
  assert.equal(verdict.reason, "visibility-changed");
});

test("a policy that moved while queued blocks the send", () => {
  const verdict = evaluateSend(context({ policyChanged: true }));
  assert.equal(verdict.canSend, false);
  assert.equal(verdict.reason, "policy-changed");
});

test("being offline is reported before the checks that need the network", () => {
  const verdict = evaluateSend(
    context({ online: false, hasPermission: false }),
  );
  // Offline first: the reader can wait that out, and telling them they lack a
  // permission that was never re-checked would be a guess.
  assert.equal(verdict.reason, "offline");
});

test("a draft with nothing wrong sends", () => {
  assert.deepEqual(evaluateSend(context()), { canSend: true });
});

test("only the author can read a draft, at either scope", () => {
  assert.equal(canRead(draft(), ME), true);
  assert.equal(canRead(draft(), OTHER), false);
  // Syncing is about surviving a lost laptop, not about sharing.
  assert.equal(canRead(promoteToWorkspace(draft()), OTHER), false);
});

test("promotion is explicit and changes only the scope", () => {
  const before = draft();
  const after = promoteToWorkspace(before);
  assert.equal(after.scope, "workspace");
  assert.equal(before.scope, "device", "the original is not mutated");
  assert.equal(after.body, before.body);
  assert.equal(after.id, before.id);
});

test("no draft is ever indexed, at any scope", () => {
  // Not a subset — none. A half-written message someone thought better of is
  // not a record, and mining it would teach people not to type.
  assert.deepEqual(
    indexableDrafts([draft(), draft({ id: "d2", scope: "workspace" })]),
    [],
  );
});

test("device scope is the default a draft starts at", () => {
  assert.equal(draft().scope, "device");
});
