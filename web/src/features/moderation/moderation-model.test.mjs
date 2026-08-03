import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBanTemplate,
  buildMuteListTemplate,
  buildReportTemplate,
  buildResolveReportTemplate,
  buildTimeoutTemplate,
  findRestriction,
  formatTimeoutRemaining,
  isTimedOut,
  isTimeoutActive,
  mutedPubkeysFromEvent,
  parseRestrictionTimestampMs,
  parseTimeoutRejection,
  reportTypeLabel,
  resolutionStatusFor,
  timeoutExpiresAt,
  toggleMuted,
} from "@/features/moderation/moderation-model";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

test("a report carries the author, the event, and the category on the e tag", () => {
  const template = buildReportTemplate({
    authorPubkey: ALICE.toUpperCase(),
    eventId: "e".repeat(64),
    reportType: "spam",
    note: "  連投  ",
  });
  assert.equal(template.kind, 1984);
  // Normalized: the relay matches keys lowercase, and an upper-case p tag would
  // silently target nobody.
  assert.deepEqual(template.tags[0], ["p", ALICE]);
  // The category rides the e tag's third element — this is where triage reads it.
  assert.deepEqual(template.tags[1], ["e", "e".repeat(64), "spam"]);
  assert.equal(template.content, "連投");
});

test("a report with no note carries empty content rather than whitespace", () => {
  const template = buildReportTemplate({
    authorPubkey: ALICE,
    eventId: "e".repeat(64),
    reportType: "other",
    note: "   ",
  });
  assert.equal(template.content, "");
});

test("no moderation command carries an h tag", () => {
  // The relay binds the community from the connection host and rejects a
  // channel-scoped moderation command outright — so a stray h tag here would not
  // narrow the ban, it would fail it.
  for (const template of [
    buildBanTemplate({ pubkey: ALICE }),
    buildTimeoutTemplate({ pubkey: ALICE, expiresAt: 42 }),
    buildResolveReportTemplate({
      reportEventId: "f".repeat(64),
      action: "ban",
    }),
  ]) {
    assert.equal(
      template.tags.some((tag) => tag[0] === "h"),
      false,
    );
  }
});

test("a ban is permanent unless given an expiry", () => {
  const permanent = buildBanTemplate({ pubkey: ALICE });
  assert.equal(
    permanent.tags.some((tag) => tag[0] === "expiration"),
    false,
  );
  const temporary = buildBanTemplate({ pubkey: ALICE, expiresAt: 1_700_000 });
  assert.deepEqual(temporary.tags[1], ["expiration", "1700000"]);
});

test("a timeout always carries its absolute expiry", () => {
  const template = buildTimeoutTemplate({
    pubkey: ALICE,
    expiresAt: 1_700_000,
    reason: "落ち着いて",
  });
  assert.equal(template.kind, 9042);
  assert.deepEqual(template.tags, [
    ["p", ALICE],
    ["expiration", "1700000"],
    ["reason", "落ち着いて"],
  ]);
});

test("timeoutExpiresAt resolves a duration against the given clock", () => {
  // Milliseconds in, epoch seconds out — the unit the relay's expiration tag uses.
  assert.equal(timeoutExpiresAt(3600, 1_000_000_000), 1_003_600);
});

test("only dismiss pairs with the dismissed status", () => {
  assert.equal(resolutionStatusFor("dismiss"), "dismissed");
  for (const action of ["ban", "timeout", "delete", "kick", "escalate"]) {
    assert.equal(resolutionStatusFor(action), "resolved");
  }
});

test("a resolution carries the report, its status, and the action", () => {
  const template = buildResolveReportTemplate({
    reportEventId: "F".repeat(64),
    action: "dismiss",
  });
  assert.equal(template.kind, 9044);
  assert.deepEqual(template.tags, [
    ["report", "f".repeat(64)],
    ["status", "dismissed"],
    ["action", "dismiss"],
  ]);
});

test("a timeout rejection is recognized by its prefix", () => {
  const parsed = parseTimeoutRejection(
    "restricted: you are timed out until 1700000",
  );
  assert.deepEqual(parsed, { expiresAtMs: 1_700_000_000 });
});

test("an unparseable expiry still counts as timed out", () => {
  // Failing to read the clock is not evidence the block is absent.
  assert.deepEqual(
    parseTimeoutRejection("restricted: you are timed out until soon"),
    { expiresAtMs: null },
  );
  assert.deepEqual(
    parseTimeoutRejection("restricted: you are timed out until -5"),
    { expiresAtMs: null },
  );
});

test("any other rejection is left for the caller's error path", () => {
  assert.equal(parseTimeoutRejection("rate-limited: slow down"), null);
  assert.equal(parseTimeoutRejection(""), null);
  assert.equal(parseTimeoutRejection(null), null);
  assert.equal(parseTimeoutRejection(undefined), null);
});

test("an unknown expiry keeps the block active", () => {
  assert.equal(isTimeoutActive(null), true);
  assert.equal(isTimeoutActive(2000, 1000), true);
  assert.equal(isTimeoutActive(1000, 2000), false);
});

test("the countdown reads in the largest useful unit", () => {
  const now = 1_000_000;
  assert.equal(formatTimeoutRemaining(now + 7_325_000, now), "2時間2分");
  assert.equal(formatTimeoutRemaining(now + 200_000, now), "3分20秒");
  assert.equal(formatTimeoutRemaining(now + 12_000, now), "12秒");
  // Nothing to count down to.
  assert.equal(formatTimeoutRemaining(null, now), null);
  assert.equal(formatTimeoutRemaining(now - 1, now), null);
});

test("restriction timestamps accept RFC3339 and unix seconds", () => {
  assert.equal(
    parseRestrictionTimestampMs("2026-01-01T00:00:00Z"),
    Date.parse("2026-01-01T00:00:00Z"),
  );
  assert.equal(parseRestrictionTimestampMs(1_700_000), 1_700_000_000);
  // A bad value must not render a phantom restriction.
  assert.equal(parseRestrictionTimestampMs("not a date"), null);
  assert.equal(parseRestrictionTimestampMs(null), null);
  assert.equal(parseRestrictionTimestampMs(undefined), null);
});

test("a timeout in the past is not a timeout", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");
  assert.equal(isTimedOut("2026-07-01T00:00:00Z", now), true);
  assert.equal(isTimedOut("2026-05-01T00:00:00Z", now), false);
  assert.equal(isTimedOut(null, now), false);
});

test("a restriction is found regardless of key case", () => {
  const rows = [{ pubkey: ALICE.toUpperCase(), banned: true }];
  assert.equal(findRestriction(rows, ALICE)?.banned, true);
  assert.equal(findRestriction(rows, BOB), null);
  assert.equal(findRestriction(undefined, ALICE), null);
  assert.equal(findRestriction(rows, null), null);
});

test("a mute list is published whole, deduplicated and lowercased", () => {
  const template = buildMuteListTemplate([ALICE.toUpperCase(), ALICE, BOB, ""]);
  assert.equal(template.kind, 10000);
  assert.deepEqual(template.tags, [
    ["p", ALICE],
    ["p", BOB],
  ]);
});

test("toggling a mute returns the whole next list", () => {
  const muted = new Set([ALICE]);
  const added = toggleMuted(muted, BOB);
  assert.deepEqual([...added].sort(), [ALICE, BOB].sort());
  // The original is untouched: the caller publishes the returned list, and
  // mutating in place would leave a failed publish showing the new state.
  assert.deepEqual([...muted], [ALICE]);
  assert.deepEqual([...toggleMuted(added, ALICE)], [BOB]);
});

test("mutedPubkeysFromEvent reads only p tags", () => {
  const muted = mutedPubkeysFromEvent({
    tags: [
      ["p", ALICE.toUpperCase()],
      ["e", "e".repeat(64)],
      ["p"],
      ["p", BOB],
    ],
  });
  assert.deepEqual([...muted].sort(), [ALICE, BOB].sort());
  assert.equal(mutedPubkeysFromEvent(null).size, 0);
});

test("an unknown report category falls back to its raw value", () => {
  assert.equal(reportTypeLabel("spam"), "スパム");
  assert.equal(reportTypeLabel("something-new"), "something-new");
});
