import assert from "node:assert/strict";
import test from "node:test";

import {
  applyEdit,
  canvasFromTemplate,
  fillPlaceholders,
  isEmpty,
  isStaleWrite,
  PLACEHOLDER_TOKENS,
} from "@/features/canvas/canvas-model";

const values = { channelName: "incident-0731", templateName: "障害対応" };

test("both documented placeholders resolve", () => {
  assert.equal(
    fillPlaceholders("# {channel.name} / {template.name}", values),
    "# incident-0731 / 障害対応",
  );
  // And the help text offers exactly what actually works.
  assert.deepEqual(PLACEHOLDER_TOKENS, ["{channel.name}", "{template.name}"]);
});

test("every occurrence is replaced, not just the first", () => {
  // A heading and a footer both naming the channel is the ordinary case.
  assert.equal(
    fillPlaceholders("{channel.name} … {channel.name}", values),
    "incident-0731 … incident-0731",
  );
});

test("an unknown token is left exactly as written", () => {
  // Substituting empty would hide the typo; the author can see this one.
  assert.equal(
    fillPlaceholders("{chanel.name} と {channel.name}", values),
    "{chanel.name} と incident-0731",
  );
});

test("the placeholder set is closed, so a template cannot reach for anything", () => {
  // Two independent things stop a template resolving arbitrary paths, and this
  // pins both. The map is closed, so `{user.email}` has nothing to resolve to;
  // and the token pattern is lowercase-and-dots only, so a tail that collides
  // with a real key — `{secrets.channelName}` — is not even recognised as a
  // placeholder. Either alone would be enough; both means a change to one does
  // not silently open a hole.
  const template = [
    "{secrets.channelName}",
    "{anything.templateName}",
    "{secrets.api_key}",
    "{user.email}",
  ].join(" ");
  assert.equal(fillPlaceholders(template, values), template);
  assert.ok(!fillPlaceholders(template, values).includes("incident-0731"));
});

test("a template with no placeholders is unchanged", () => {
  assert.equal(fillPlaceholders("ただの文章", values), "ただの文章");
  assert.equal(fillPlaceholders("", values), "");
});

test("a canvas seeded from a template starts at revision one", () => {
  const canvas = canvasFromTemplate({
    channelId: "c1",
    nowSeconds: 1000,
    template: "# {channel.name} 対応記録",
    updatedByPubkey: "a".repeat(64),
    values,
  });
  assert.equal(canvas.body, "# incident-0731 対応記録");
  assert.equal(canvas.revision, 1);
  assert.equal(canvas.updatedAt, 1000);
});

test("an edit bumps the revision, so a concurrent writer can notice", () => {
  const first = canvasFromTemplate({
    channelId: "c1",
    nowSeconds: 1000,
    template: "はじめ",
    updatedByPubkey: "a".repeat(64),
    values,
  });
  const second = applyEdit(first, "あと", "b".repeat(64), 2000);
  assert.equal(second.revision, 2);
  assert.equal(second.body, "あと");
  assert.equal(second.updatedByPubkey, "b".repeat(64));
  // The original is not mutated.
  assert.equal(first.body, "はじめ");
});

test("a write from an older revision is recognised as stale", () => {
  // Last-write-wins on a shared document loses the slower typist's work without
  // telling them, so the comparison exists to turn that into a question.
  assert.equal(isStaleWrite(1, 2), true);
  assert.equal(isStaleWrite(2, 2), false);
  // A revision ahead of the stored one is not stale — it cannot happen, and
  // treating it as stale would block a legitimate save if it did.
  assert.equal(isStaleWrite(3, 2), false);
});

test("a blank canvas is empty however it got that way", () => {
  const blank = canvasFromTemplate({
    channelId: "c1",
    nowSeconds: 0,
    template: "   \n  ",
    updatedByPubkey: "a".repeat(64),
    values,
  });
  assert.equal(isEmpty(blank), true);
  assert.equal(isEmpty(null), true);
  assert.equal(isEmpty({ ...blank, body: "何か" }), false);
});
