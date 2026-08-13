import assert from "node:assert/strict";
import test from "node:test";

import {
  derivedMembershipId,
  isSameAccount,
  isSelf,
  membershipForPubkey,
  membershipIdForPubkey,
  membershipLabel,
  membershipsOfAccount,
} from "@/features/identity/membership";

const membership = (overrides = {}) => ({
  id: "mem-acme-1",
  accountId: "acct-1",
  workspaceId: "ws-acme",
  role: "member",
  displayName: "中山",
  pubkey: "a".repeat(64),
  ...overrides,
});

test("the same person in two workspaces is still one person", () => {
  // Two memberships, two keys, one account. By pubkey these would read as two
  // strangers, which is the thing the migration exists to fix.
  const acme = membership({ id: "mem-acme-1", workspaceId: "ws-acme" });
  const other = membership({
    id: "mem-beta-1",
    workspaceId: "ws-beta",
    pubkey: "b".repeat(64),
  });
  assert.equal(isSameAccount(acme, other), true);
  assert.notEqual(acme.pubkey, other.pubkey);
});

test("two accounts are not the same person even on a shared key", () => {
  const left = membership({ accountId: "acct-1" });
  const right = membership({ accountId: "acct-2", id: "mem-2" });
  assert.equal(isSameAccount(left, right), false);
});

test("rotating a key does not make someone a stranger", () => {
  const before = membership();
  const after = membership({ pubkey: "f".repeat(64) });
  assert.equal(isSameAccount(before, after), true);
  // And it is still the same membership, so still "you".
  assert.equal(isSelf(after, before), true);
});

test("self is decided by membership, not by account", () => {
  // The reader's other workspace membership is them, but it is not *this* row —
  // "You" beside a message they did not write here would be wrong.
  const here = membership({ id: "mem-acme-1", workspaceId: "ws-acme" });
  const elsewhere = membership({ id: "mem-beta-1", workspaceId: "ws-beta" });
  assert.equal(isSelf(here, here), true);
  assert.equal(isSelf(elsewhere, here), false);
});

test("with no viewer, nothing is self", () => {
  assert.equal(isSelf(membership(), null), false);
});

test("an old event's pubkey still resolves to a membership", () => {
  // History is not rewritten: events keep the keys they were signed with, and
  // an index carries them forward.
  const list = [
    membership(),
    membership({ id: "mem-2", pubkey: "b".repeat(64) }),
  ];
  assert.equal(membershipForPubkey(list, "A".repeat(64)).id, "mem-acme-1");
  assert.equal(membershipForPubkey(list, "b".repeat(64)).id, "mem-2");
});

test("a key nobody signs with resolves to null rather than throwing", () => {
  // A real case — the author may have left — not an error.
  assert.equal(membershipForPubkey([membership()], "c".repeat(64)), null);
});

test("an account's memberships come back in a stable order", () => {
  const list = [
    membership({ id: "m-z", workspaceId: "ws-zeta" }),
    membership({ id: "m-a", workspaceId: "ws-alpha" }),
    membership({ id: "m-other", accountId: "acct-2", workspaceId: "ws-beta" }),
  ];
  assert.deepEqual(
    membershipsOfAccount(list, "acct-1").map((row) => row.workspaceId),
    ["ws-alpha", "ws-zeta"],
  );
});

test("a membership is labelled by name, never by key", () => {
  assert.equal(membershipLabel(membership()), "中山");
  // Falls back to the membership id, which is still not the pubkey.
  const anonymous = membership({ displayName: "" });
  assert.equal(membershipLabel(anonymous), "mem-acme-1");
  assert.ok(!membershipLabel(anonymous).includes("aaaa"));
});

test("a key with no membership record still resolves to a membership id", () => {
  // Always a case: an event signed by someone who has left, or by a member of a
  // workspace whose roster this client does not hold. "Never show a pubkey" has
  // to cover that one too.
  const id = membershipIdForPubkey([], "f".repeat(64));
  assert.match(id, /^mem_/);
  assert.ok(!id.includes("ffff"), "the key must not leak into the fallback");
});

test("a derived id is stable and visibly a placeholder", () => {
  const key = "9".repeat(64);
  assert.equal(derivedMembershipId(key), derivedMembershipId(key));
  assert.equal(
    derivedMembershipId(key),
    derivedMembershipId(key.toUpperCase()),
  );
  assert.match(derivedMembershipId(key), /^mem_/);
  assert.notEqual(
    derivedMembershipId(key),
    derivedMembershipId("a".repeat(64)),
  );
});

test("a recorded membership wins over a derived one", () => {
  const list = [membership()];
  assert.equal(membershipIdForPubkey(list, "a".repeat(64)), "mem-acme-1");
  // The recorded id, not the derived placeholder shape.
  assert.ok(!/^mem_/.test(membershipIdForPubkey(list, "a".repeat(64))));
});

test("no membership id contains a run of hex from the key", () => {
  // The property that matters: whatever the format, a pubkey must not survive
  // into it. A format change that started echoing the key would fail here.
  const key = "deadbeef".repeat(8);
  for (const id of [
    derivedMembershipId(key),
    membershipIdForPubkey([], key),
    membershipIdForPubkey([membership({ pubkey: key })], key),
  ]) {
    assert.ok(!id.includes("deadbeef"), id);
  }
});
