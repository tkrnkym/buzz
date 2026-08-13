import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_HOST,
  formatLifetime,
  isValidSlug,
  redirectStillActive,
  SESSION_LIFETIMES,
  slugAvailableForReuse,
  SLUG_REDIRECT_SECONDS,
  slugProblem,
  usesSharedRootCookie,
  workspaceHost,
} from "@/features/identity/workspace";

const DAY = 24 * 3_600;

test("a workspace is reached at its own subdomain", () => {
  assert.equal(workspaceHost("acme"), "acme.nuxx.ai");
  // And the account host is not a workspace.
  assert.equal(ACCOUNT_HOST, "app.nuxx.ai");
  assert.equal(slugProblem("app"), "reserved");
});

test("a slug has to survive being a DNS label", () => {
  assert.equal(slugProblem("ab"), "too-short");
  assert.equal(slugProblem("a".repeat(64)), "too-long");
  assert.equal(slugProblem("a".repeat(63)), null);
  assert.equal(slugProblem("My Team"), "bad-characters");
  assert.equal(slugProblem("my_team"), "bad-characters");
  assert.equal(slugProblem("-acme"), "edge-hyphen");
  assert.equal(slugProblem("acme-"), "edge-hyphen");
  assert.equal(isValidSlug("acme-jp"), true);
});

test("one problem is reported at a time, most fundamental first", () => {
  // "My Team!" is both wrong characters and, once fixed, fine — listing four
  // objections at once is harder to act on than one.
  assert.equal(slugProblem("My Team!"), "bad-characters");
});

test("hostnames an operator types by accident cannot be claimed", () => {
  for (const reserved of ["www", "api", "admin", "relay", "status"]) {
    assert.equal(slugProblem(reserved), "reserved", reserved);
  }
});

test("an old address keeps working for ninety days", () => {
  assert.equal(SLUG_REDIRECT_SECONDS, 90 * DAY);
  assert.equal(redirectStillActive(0, 89 * DAY), true);
  // Inclusive at the boundary, in the workspace's favour.
  assert.equal(redirectStillActive(0, 90 * DAY), true);
  assert.equal(redirectStillActive(0, 90 * DAY + 1), false);
});

test("a freed slug is not reassigned while it still redirects", () => {
  // A shared link landing on a *different* organisation is worse than a dead
  // link, so reuse waits for the redirect to lapse.
  assert.equal(slugAvailableForReuse(0, 30 * DAY), false);
  assert.equal(slugAvailableForReuse(0, 90 * DAY), false);
  assert.equal(slugAvailableForReuse(0, 90 * DAY + 1), true);
});

test("no cookie is shared across the root domain", () => {
  // One workspace's XSS must not become every workspace's problem.
  assert.equal(usesSharedRootCookie(), false);
});

test("the session lifetimes are the ones the policy states", () => {
  assert.equal(SESSION_LIFETIMES.accessSeconds, 15 * 60);
  assert.equal(SESSION_LIFETIMES.refreshSeconds, 12 * 3_600);
  assert.equal(SESSION_LIFETIMES.absoluteSeconds, 7 * DAY);
  assert.equal(SESSION_LIFETIMES.rotatesOnUse, true);
});

test("each session bound is shorter than the one that outlives it", () => {
  // The property behind the three numbers: an access token must expire before
  // the refresh that renews it, and both before the absolute ceiling.
  assert.ok(SESSION_LIFETIMES.accessSeconds < SESSION_LIFETIMES.refreshSeconds);
  assert.ok(
    SESSION_LIFETIMES.refreshSeconds < SESSION_LIFETIMES.absoluteSeconds,
  );
});

test("lifetimes read in the unit they were chosen in", () => {
  assert.equal(formatLifetime(15 * 60), "15分");
  assert.equal(formatLifetime(12 * 3_600), "12時間");
  assert.equal(formatLifetime(7 * DAY), "7日");
});
