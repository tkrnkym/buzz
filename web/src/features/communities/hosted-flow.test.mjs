import assert from "node:assert/strict";
import test from "node:test";

import {
  canAdvance,
  EMPTY_HOSTED_DRAFT,
  hostedDraftToCommunity,
  hostedInviteLink,
  inviteRecipients,
  nextStep,
  previousStep,
  stepIndex,
} from "@/features/communities/hosted-flow";

const draft = (overrides) => ({ ...EMPTY_HOSTED_DRAFT, ...overrides });

test("the steps run in order and stop at both ends", () => {
  assert.equal(nextStep("name"), "policy");
  assert.equal(nextStep("policy"), "invite");
  assert.equal(nextStep("invite"), "done");
  // Clamped rather than wrapping: the last step is a result, and a "next" that
  // returned to the name field would read as the community not being created.
  assert.equal(nextStep("done"), "done");
  assert.equal(previousStep("policy"), "name");
  assert.equal(previousStep("name"), "name");
  assert.equal(stepIndex("invite"), 2);
});

test("only the name gates the flow", () => {
  assert.equal(canAdvance("name", draft({ name: "" })), false);
  assert.equal(canAdvance("name", draft({ name: "ab" })), false);
  assert.equal(canAdvance("name", draft({ name: "-bad" })), false);
  assert.equal(canAdvance("name", draft({ name: "my-team" })), true);
  // The policy always has a value, and inviting nobody is a legitimate way to
  // start — blocking on it would be a demand rather than an offer.
  assert.equal(canAdvance("policy", draft()), true);
  assert.equal(canAdvance("invite", draft({ inviteTo: "" })), true);
});

test("a new community starts invite-only", () => {
  // The safe default for something that does not exist yet: an open door on a
  // community with nothing in it cannot be reconsidered after the fact.
  assert.equal(EMPTY_HOSTED_DRAFT.joinPolicy, "invite");
});

test("invitees are split on newlines and commas alike", () => {
  // People paste both. Accepting one separator would invite a single address
  // made of three, silently.
  assert.deepEqual(
    inviteRecipients(draft({ inviteTo: "a@example.jp\nb@example.jp" })),
    ["a@example.jp", "b@example.jp"],
  );
  assert.deepEqual(
    inviteRecipients(draft({ inviteTo: " a@example.jp , b@example.jp ," })),
    ["a@example.jp", "b@example.jp"],
  );
  assert.deepEqual(inviteRecipients(draft({ inviteTo: "\n , \n" })), []);
});

test("the created community carries the name, URL, and policy that were chosen", () => {
  const community = hostedDraftToCommunity(
    draft({
      name: "My-Team",
      joinPolicy: "open",
      inviteTo: "a@example.jp\nb@example.jp",
    }),
    "community-1",
  );
  // The name becomes a hostname label, so it is lowercased rather than refused.
  assert.equal(community.name, "my-team");
  assert.equal(community.relayUrl, "wss://my-team.nuxx.host");
  assert.equal(community.hosted, true);
  assert.equal(community.joinPolicy, "open");
  // The owner plus whoever was invited: reporting 1 after inviting two would look
  // like the invites had failed.
  assert.equal(community.memberCount, 3);
});

test("a community created with nobody invited has one member", () => {
  assert.equal(
    hostedDraftToCommunity(draft({ name: "solo" }), "c1").memberCount,
    1,
  );
});

test("the invite link is under the community's own host", () => {
  assert.equal(
    hostedInviteLink("My-Team", "abc123"),
    "https://my-team.nuxx.host/invite/abc123",
  );
});
