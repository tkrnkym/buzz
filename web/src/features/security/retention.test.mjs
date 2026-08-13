import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_RETENTION,
  formatRetention,
  formatTarget,
  isValidRetentionOverride,
  RECOVERY_TARGETS,
  REGIONS,
  RETENTION,
  suggestRegion,
} from "@/features/security/retention";

const DAY = 24 * 3_600;

const entryFor = (key) => RETENTION.find((row) => row.key === key);

test("the defaults are the ones the policy states", () => {
  assert.equal(DEFAULT_RETENTION["execution-logs"], 90 * DAY);
  assert.equal(DEFAULT_RETENTION["audit-logs"], 365 * DAY);
  assert.equal(DEFAULT_RETENTION.cache, 7 * DAY);
  assert.equal(DEFAULT_RETENTION.trash, 30 * DAY);
  assert.equal(DEFAULT_RETENTION.backup, 35 * DAY);
});

test("the workspace's own content has no expiry, which is not zero", () => {
  // `null` is "kept while the workspace exists". A 0 here would read as
  // "delete immediately", which is the opposite.
  for (const key of ["content", "file-versions", "decisions"]) {
    assert.equal(DEFAULT_RETENTION[key], null);
  }
});

test("an audit log outlives the execution log it explains", () => {
  // The property behind the table: an approval has to be answerable for long
  // after the run's debug output stopped being useful.
  assert.ok(
    DEFAULT_RETENTION["audit-logs"] > DEFAULT_RETENTION["execution-logs"],
  );
});

test("the backup window outlives the trash, so nothing looks gone early", () => {
  // Someone told "deleted" who finds it in a restore has been misled, so the
  // backup number must be the larger and the one shown.
  assert.ok(DEFAULT_RETENTION.backup > DEFAULT_RETENTION.trash);
});

test("a fixed entry refuses any override", () => {
  assert.equal(isValidRetentionOverride(entryFor("content"), 10 * DAY), false);
  assert.equal(isValidRetentionOverride(entryFor("backup"), 10 * DAY), false);
});

test("a configurable entry accepts a longer value too", () => {
  // Unlike an approval deadline, keeping your own records longer is not a
  // weakening — it is the workspace's call.
  const logs = entryFor("execution-logs");
  assert.equal(isValidRetentionOverride(logs, 30 * DAY), true);
  assert.equal(isValidRetentionOverride(logs, 400 * DAY), true);
  assert.equal(isValidRetentionOverride(logs, 0), false);
  assert.equal(isValidRetentionOverride(logs, -1), false);
  assert.equal(isValidRetentionOverride(logs, Number.NaN), false);
});

test("a region is suggested from the locale but never inferred silently", () => {
  assert.equal(suggestRegion("ja-JP"), "apac");
  assert.equal(suggestRegion("de-DE"), "eu");
  assert.equal(suggestRegion("en-US"), "us");
  // An unknown locale falls back to a stated default, not to array order.
  assert.equal(suggestRegion("xx-YY"), "us");
});

test("the three regions the policy names are the ones offered", () => {
  assert.deepEqual(
    REGIONS.map((region) => region.id),
    ["apac", "eu", "us"],
  );
});

test("Community Edition promises no recovery target rather than a made-up one", () => {
  const ce = RECOVERY_TARGETS.find((row) => row.edition === "community");
  assert.equal(ce.rpoSeconds, null);
  assert.equal(ce.rtoSeconds, null);
  assert.equal(formatTarget(null), "—");
});

test("Enterprise recovers at least as fast as Standard on both measures", () => {
  const saas = RECOVERY_TARGETS.find((row) => row.edition === "saas");
  const ent = RECOVERY_TARGETS.find((row) => row.edition === "enterprise");
  assert.ok(ent.rpoSeconds < saas.rpoSeconds);
  assert.ok(ent.rtoSeconds < saas.rtoSeconds);
});

test("durations read in the unit they were written in", () => {
  assert.equal(formatRetention(null), "Workspace 存続中");
  assert.equal(formatRetention(90 * DAY), "90日");
  assert.equal(formatRetention(365 * DAY), "1年");
  assert.equal(formatTarget(15 * 60), "15分以内");
  assert.equal(formatTarget(4 * 3_600), "4時間以内");
});
