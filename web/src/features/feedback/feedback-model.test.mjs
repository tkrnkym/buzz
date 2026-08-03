import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeedbackTemplate,
  canSendFeedback,
  FEEDBACK_BODY_MAX_BYTES,
  feedbackBodyBytes,
} from "@/features/feedback/feedback-model";

test("feedback carries the body and, at most, one category tag", () => {
  // Two category tags is a rejection at ingest, not a last-one-wins — so the
  // builder takes a single value rather than a list.
  const template = buildFeedbackTemplate({
    body: "  直したい  ",
    category: "bug",
  });
  assert.equal(template.kind, 42000);
  assert.deepEqual(template.tags, [["category", "bug"]]);
  assert.equal(template.content, "直したい");
});

test("a category is optional, because the relay accepts feedback without one", () => {
  const template = buildFeedbackTemplate({ body: "ひとこと" });
  assert.deepEqual(template.tags, []);
});

test("attachments ride imeta tags after the category", () => {
  const template = buildFeedbackTemplate({
    body: "画面はこれです",
    category: "needs-work",
    attachments: [["imeta", "url https://relay.example/x.png"]],
  });
  assert.deepEqual(template.tags, [
    ["category", "needs-work"],
    ["imeta", "url https://relay.example/x.png"],
  ]);
});

test("the body is measured in bytes, not characters", () => {
  // The relay's limit is a byte limit, and Japanese is three bytes a character —
  // a character count would let a body through that ingest then refuses.
  assert.equal(feedbackBodyBytes("abc"), 3);
  assert.equal(feedbackBodyBytes("あ"), 3);
});

test("an empty body cannot be sent, because ingest refuses it", () => {
  assert.equal(canSendFeedback(""), false);
  assert.equal(canSendFeedback("   \n  "), false);
  assert.equal(canSendFeedback("ひとこと"), true);
});

test("an over-long body cannot be sent either", () => {
  const tooLong = "あ".repeat(FEEDBACK_BODY_MAX_BYTES);
  assert.ok(feedbackBodyBytes(tooLong) > FEEDBACK_BODY_MAX_BYTES);
  assert.equal(canSendFeedback(tooLong), false);
});
