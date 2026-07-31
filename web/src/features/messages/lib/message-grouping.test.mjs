import assert from "node:assert/strict";
import test from "node:test";

import {
  MESSAGE_GROUPING_WINDOW_SECONDS,
  hasSameMessageAuthor,
  isWithinGroupingWindow,
} from "@/features/messages/lib/message-grouping";

test("the same author groups regardless of key casing", () => {
  // Two spellings of one key must not split a burst into separate blocks.
  assert.ok(
    hasSameMessageAuthor(
      { pubkey: "AB".repeat(32) },
      { pubkey: "ab".repeat(32) },
    ),
  );
  assert.ok(hasSameMessageAuthor({ pubkey: " abc " }, { pubkey: "abc" }));
});

test("a missing author never groups", () => {
  assert.ok(!hasSameMessageAuthor(null, { pubkey: "abc" }));
  assert.ok(!hasSameMessageAuthor({ pubkey: "abc" }, undefined));
  assert.ok(!hasSameMessageAuthor({ pubkey: "" }, { pubkey: "" }));
  assert.ok(!hasSameMessageAuthor({ pubkey: null }, { pubkey: null }));
});

test("different authors never group", () => {
  assert.ok(!hasSameMessageAuthor({ pubkey: "aaa" }, { pubkey: "bbb" }));
});

test("the grouping window is inclusive at its edge", () => {
  assert.ok(
    isWithinGroupingWindow(1000, 1000 + MESSAGE_GROUPING_WINDOW_SECONDS),
  );
  assert.ok(
    !isWithinGroupingWindow(1000, 1000 + MESSAGE_GROUPING_WINDOW_SECONDS + 1),
  );
});

test("a message at the same instant is in window", () => {
  assert.ok(isWithinGroupingWindow(1000, 1000));
});

test("an out-of-order pair is out of window", () => {
  // Grouping them would render the later message under the earlier one's header.
  assert.ok(!isWithinGroupingWindow(1000, 999));
});

test("a non-numeric timestamp is out of window rather than throwing", () => {
  assert.ok(!isWithinGroupingWindow(null, 1000));
  assert.ok(!isWithinGroupingWindow(1000, undefined));
});
