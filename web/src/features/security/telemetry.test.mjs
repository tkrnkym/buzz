import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultState,
  isConfigurable,
  isSafeTagValue,
  NEVER_COLLECTED,
  sanitize,
  TELEMETRY_CATEGORIES,
} from "@/features/security/telemetry";

const EDITIONS = ["community", "self-hosted-enterprise", "saas"];

test("a self-hosted deployment sends nothing until someone turns it on", () => {
  // Nobody asked a vendor to watch their own server.
  for (const edition of ["community", "self-hosted-enterprise"]) {
    for (const { id } of TELEMETRY_CATEGORIES) {
      assert.equal(
        defaultState(edition, id),
        "optional-off",
        `${edition}/${id}`,
      );
    }
  }
});

test("the hosted service requires only what it needs to operate", () => {
  assert.equal(defaultState("saas", "operational"), "required");
  // Product analytics is separable, and off until asked for.
  assert.equal(defaultState("saas", "product-analytics"), "optional-off");
});

test("nothing is ever required on a self-hosted deployment", () => {
  for (const edition of ["community", "self-hosted-enterprise"]) {
    for (const { id } of TELEMETRY_CATEGORIES) {
      assert.equal(isConfigurable(defaultState(edition, id)), true);
    }
  }
});

test("a required category is not offered as a switch", () => {
  // A toggle that silently does nothing is worse than a row that says required.
  assert.equal(isConfigurable("required"), false);
  assert.equal(isConfigurable("optional-on"), true);
  assert.equal(isConfigurable("optional-off"), true);
});

test("the four things never collected are named", () => {
  assert.deepEqual(
    [...NEVER_COLLECTED],
    ["メッセージ本文", "Files の内容", "Secrets", "Agent の入出力"],
  );
});

test("an event has nowhere to put content", () => {
  // The structural guarantee: metrics are numbers and tags are short enums, so
  // there is no free-text field for "context" to become a message body in.
  const event = {
    event: "channel.opened",
    at: 1000,
    metrics: { durationMs: 12 },
    tags: { surface: "sidebar" },
  };
  assert.deepEqual(sanitize(event), event);
  for (const value of Object.values(event.metrics)) {
    assert.equal(typeof value, "number");
  }
});

test("an identifier smuggled into a tag is dropped", () => {
  const pubkey = "a1b2c3d4e5f60718";
  const sanitized = sanitize({
    event: "message.sent",
    at: 1,
    metrics: {},
    tags: { surface: "composer", author: pubkey },
  });
  assert.deepEqual(sanitized.tags, { surface: "composer" });
  assert.ok(!JSON.stringify(sanitized).includes(pubkey));
});

test("prose is dropped however short it is", () => {
  // A length cap alone would not catch this: Japanese is dense enough that any
  // limit generous enough for real enum names also fits a whole message.
  for (const body of [
    "今日のリリースは金曜に延期します、理由は後ほど共有します",
    "金曜に延期",
    "deploy failed on staging",
  ]) {
    const sanitized = sanitize({
      event: "message.sent",
      at: 1,
      metrics: {},
      tags: { body },
    });
    assert.deepEqual(sanitized.tags, {}, body);
  }
});

test("sanitising never throws, so telemetry cannot break the feature", () => {
  // A measurement mistake must not take down the thing being measured.
  assert.doesNotThrow(() =>
    sanitize({ event: "x", at: 0, metrics: {}, tags: { a: "f".repeat(200) } }),
  );
});

test("tag safety is about looking like an enum, not about a blocklist", () => {
  // What the codebase actually writes.
  for (const value of ["sidebar", "dm", "channel.opened", "file-view", "v2"]) {
    assert.equal(isSafeTagValue(value), true, value);
  }
  // What content looks like.
  for (const value of [
    "a".repeat(33),
    "deadbeefdeadbeef",
    "サイドバー",
    "two words",
    "Sidebar",
    "",
  ]) {
    assert.equal(isSafeTagValue(value), false, value);
  }
});

test("every edition resolves a state for every category", () => {
  for (const edition of EDITIONS) {
    for (const { id } of TELEMETRY_CATEGORIES) {
      assert.ok(defaultState(edition, id));
    }
  }
});
