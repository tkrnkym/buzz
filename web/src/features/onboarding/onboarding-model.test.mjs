import assert from "node:assert/strict";
import test from "node:test";

import {
  canSkip,
  nextStep,
  onboardingSteps,
  previousStep,
  stepPosition,
} from "@/features/onboarding/onboarding-model";

const withExtension = { hasExtension: true, hasInvite: false };
const withInvite = { hasExtension: true, hasInvite: true };

test("the invite step appears only when there is a code to redeem", () => {
  // An empty field asking for a code the reader does not have is a dead end.
  assert.deepEqual(onboardingSteps(withExtension), [
    "welcome",
    "identity",
    "profile",
    "done",
  ]);
  assert.deepEqual(onboardingSteps(withInvite), [
    "welcome",
    "identity",
    "profile",
    "invite",
    "done",
  ]);
});

test("advancing walks the flow and stops at the end", () => {
  assert.equal(nextStep("welcome", withExtension), "identity");
  assert.equal(nextStep("profile", withExtension), "done");
  assert.equal(nextStep("done", withExtension), "done");
});

test("advancing past the profile reaches the invite when there is one", () => {
  assert.equal(nextStep("profile", withInvite), "invite");
  assert.equal(nextStep("invite", withInvite), "done");
});

test("going back stops at the first step", () => {
  assert.equal(previousStep("identity", withExtension), "welcome");
  assert.equal(previousStep("welcome", withExtension), "welcome");
});

test("a step outside the flow lands on the first rather than nowhere", () => {
  // Reachable when the invite field is cleared while standing on the invite step.
  assert.equal(nextStep("invite", withExtension), "welcome");
  assert.equal(previousStep("invite", withExtension), "welcome");
});

test("the progress count excludes the closing step", () => {
  // "3 of 3" on a screen with nothing left to do is noise.
  assert.deepEqual(stepPosition("welcome", withExtension), {
    index: 0,
    total: 3,
  });
  assert.deepEqual(stepPosition("profile", withExtension), {
    index: 2,
    total: 3,
  });
  assert.deepEqual(stepPosition("invite", withInvite), { index: 3, total: 4 });
});

test("everything but the welcome and the ending can be skipped", () => {
  // A reader with no extension to install and no invite to paste must not be
  // trapped on a step they cannot complete.
  assert.equal(canSkip("welcome"), false);
  assert.equal(canSkip("identity"), true);
  assert.equal(canSkip("profile"), true);
  assert.equal(canSkip("invite"), true);
  assert.equal(canSkip("done"), false);
});
