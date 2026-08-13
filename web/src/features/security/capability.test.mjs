import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITIES,
  can,
  evaluateCapability,
  EVALUATION_ORDER,
} from "@/features/security/capability";

const set = (...items) => new Set(items);

test("every capability is resource:action, with no bare verbs", () => {
  for (const capability of CAPABILITIES) {
    assert.match(
      capability,
      /^[a-z]+:[a-z]+$/,
      `${capability} is not resource:action`,
    );
  }
});

test("nothing granted means denied, not inherited", () => {
  // Default Deny. A capability nobody granted must not fall through to allowed.
  const decision = evaluateCapability("file:publish", { subject: set() });
  assert.equal(decision.allowed, false);
  assert.equal(decision.stage, "default");
});

test("an explicit deny outranks every grant below it", () => {
  const decision = evaluateCapability("file:publish", {
    subject: set("file:publish"),
    resourceAcl: set("file:publish"),
    homeChannel: set("file:publish"),
    explicitDeny: set("file:publish"),
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.stage, "explicit-deny");
});

test("a legal hold outranks even an explicit grant, and is decided first", () => {
  const decision = evaluateCapability("channel:view", {
    subject: set("channel:view"),
    resourceAcl: set("channel:view"),
    legalHold: true,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.stage, "legal-hold");
});

test("the order is decisive, most authoritative first", () => {
  // A reordering that put a role grant above an explicit deny would read like a
  // refactor and behave like a security bug, so the order itself is pinned.
  assert.deepEqual(EVALUATION_ORDER, [
    "legal-hold",
    "explicit-deny",
    "resource-acl",
    "home-channel",
    "role",
    "default",
  ]);
});

test("an agent cannot exceed the person it acts for", () => {
  // The owner may publish; the agent was not given that, so the pair cannot.
  assert.equal(
    can("file:publish", {
      subject: set("file:publish"),
      agent: set("file:view"),
    }),
    false,
  );
  // And the reverse: an agent granted more than its owner gains nothing.
  assert.equal(
    can("file:publish", {
      subject: set("file:view"),
      agent: set("file:publish"),
    }),
    false,
  );
});

test("an agent with no capabilities at all can do nothing", () => {
  // An empty set is "delegating nothing", not "unrestricted".
  assert.equal(
    can("channel:view", { subject: set("channel:view"), agent: set() }),
    false,
  );
});

test("the upstream source can refuse what this workspace granted", () => {
  // Nuxx cannot widen a permission on a resource it does not own.
  assert.equal(
    can("file:view", {
      subject: set("file:view"),
      resourceAcl: set("file:view"),
      source: set(),
    }),
    false,
  );
  assert.equal(
    can("file:view", { subject: set("file:view"), source: set("file:view") }),
    true,
  );
});

test("a resource ACL is consulted before the channel it lives in", () => {
  const decision = evaluateCapability("file:view", {
    subject: set("file:view"),
    resourceAcl: set("file:view"),
    homeChannel: set("file:view"),
  });
  assert.equal(decision.stage, "resource-acl");
});

test("the channel is consulted before the role", () => {
  const decision = evaluateCapability("file:view", {
    subject: set("file:view"),
    homeChannel: set("file:view"),
  });
  assert.equal(decision.stage, "home-channel");
});

test("a refusal says which stage decided it", () => {
  // "Denied" with no reason is what makes a permission problem unfixable.
  for (const input of [
    { subject: set(), expected: "default" },
    {
      subject: set("file:view"),
      explicitDeny: set("file:view"),
      expected: "explicit-deny",
    },
    { subject: set("file:view"), legalHold: true, expected: "legal-hold" },
  ]) {
    assert.equal(evaluateCapability("file:view", input).stage, input.expected);
  }
});
