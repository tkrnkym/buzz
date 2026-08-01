import assert from "node:assert/strict";
import test from "node:test";

import {
  activeMentionQuery,
  applyMention,
  findMentionSpans,
  mentionRecipients,
  mentionTags,
  survivingMentions,
} from "@/features/messages/lib/mentions";

const ME = "e".repeat(64);
const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

test("an @ at the caret opens a query", () => {
  assert.deepEqual(activeMentionQuery("@ke", 3), { query: "ke", from: 0 });
  assert.deepEqual(activeMentionQuery("hi @ke", 6), { query: "ke", from: 3 });
  // A bare `@` is a valid, empty query — that is what opens a browsable list.
  assert.deepEqual(activeMentionQuery("hi @", 4), { query: "", from: 3 });
});

test("an @ inside a word is not a mention", () => {
  // Otherwise every email address opens an autocomplete mid-typing.
  assert.equal(activeMentionQuery("mail me@example.com", 19), null);
  assert.equal(activeMentionQuery("a@b", 3), null);
});

test("text with no @ has no query", () => {
  assert.equal(activeMentionQuery("hello", 5), null);
});

test("a query may contain one space, so a full name completes", () => {
  assert.deepEqual(activeMentionQuery("@田中 健", 5), {
    query: "田中 健",
    from: 0,
  });
  // Beyond that almost any sentence would count as a query.
  assert.equal(activeMentionQuery("@田中 健 です ね", 9), null);
});

test("a newline ends the mention", () => {
  assert.equal(activeMentionQuery("@ken\nhello", 10), null);
});

test("only the text before the caret is considered", () => {
  // Typing in the middle of a line must not complete against what follows.
  assert.deepEqual(activeMentionQuery("@ke and more", 3), {
    query: "ke",
    from: 0,
  });
});

test("accepting a mention replaces the token and leaves a space", () => {
  // Without the trailing space the next keystroke re-opens the autocomplete
  // against the name just accepted.
  assert.deepEqual(applyMention("hi @ke", 3, 6, "田中 健"), {
    text: "hi @田中 健 ",
    caret: 9,
  });
});

test("accepting a mention keeps the text after the caret", () => {
  assert.deepEqual(applyMention("hi @ke rest", 3, 6, "Ken"), {
    text: "hi @Ken  rest",
    caret: 8,
  });
});

test("a mention deleted from the body is not published", () => {
  // A `p` tag for a name no longer in the message notifies someone about a
  // message that does not mention them.
  const inserted = [
    { pubkey: ALICE, label: "Alice" },
    { pubkey: BOB, label: "Bob" },
  ];
  assert.deepEqual(survivingMentions("hi @Alice", inserted), [ALICE]);
  assert.deepEqual(survivingMentions("nobody", inserted), []);
});

test("one person mentioned twice is one recipient", () => {
  const inserted = [
    { pubkey: ALICE, label: "Alice" },
    { pubkey: ALICE.toUpperCase(), label: "Alice" },
  ];
  assert.deepEqual(survivingMentions("@Alice @Alice", inserted), [ALICE]);
});

test("a channel message notifies only who it mentions", () => {
  assert.deepEqual(
    mentionRecipients({
      explicitMentions: [ALICE],
      isDm: false,
      senderPubkey: ME,
      channelParticipants: [BOB],
    }),
    [ALICE],
  );
});

test("a DM notifies every other participant, mentioned or not", () => {
  // A DM with no recipient tags notifies nobody, which is not what a DM is.
  assert.deepEqual(
    mentionRecipients({
      explicitMentions: [],
      isDm: true,
      senderPubkey: ME,
      channelParticipants: [ME, ALICE],
    }),
    [ALICE],
  );
});

test("the sender is never a recipient", () => {
  // A client that notified its own author would badge every room it spoke in.
  assert.deepEqual(
    mentionRecipients({
      explicitMentions: [ME, ALICE],
      isDm: false,
      senderPubkey: ME,
    }),
    [ALICE],
  );
  assert.deepEqual(
    mentionRecipients({
      explicitMentions: [ME.toUpperCase()],
      isDm: false,
      senderPubkey: ME,
    }),
    [],
  );
});

test("with no sender resolved yet, nothing is dropped", () => {
  assert.deepEqual(
    mentionRecipients({
      explicitMentions: [ALICE],
      isDm: false,
      senderPubkey: null,
    }),
    [ALICE],
  );
});

test("recipients become p tags in order", () => {
  assert.deepEqual(mentionTags([ALICE, BOB]), [
    ["p", ALICE],
    ["p", BOB],
  ]);
  assert.deepEqual(mentionTags([]), []);
});

test("only known names are chipped", () => {
  // A chip implies this client resolved a person; an unknown handle has not
  // been resolved and stays plain text.
  assert.deepEqual(findMentionSpans("hi @Alice and @nobody", ["Alice"]), [
    { from: 3, to: 9, label: "Alice" },
  ]);
});

test("the longest matching name wins", () => {
  // "健" is a prefix of "健二": matching the short one first would chip half of
  // the longer name and leave the rest loose.
  const spans = findMentionSpans("@健二 さん", ["健", "健二"]);
  assert.deepEqual(spans, [{ from: 0, to: 3, label: "健二" }]);
});

test("a mention must start at a word boundary", () => {
  assert.deepEqual(findMentionSpans("mail@Alice", ["Alice"]), []);
  assert.deepEqual(findMentionSpans("@Alice", ["Alice"]), [
    { from: 0, to: 6, label: "Alice" },
  ]);
});

test("repeated mentions of one name are all chipped", () => {
  assert.deepEqual(findMentionSpans("@Bob and @Bob", ["Bob"]), [
    { from: 0, to: 4, label: "Bob" },
    { from: 9, to: 13, label: "Bob" },
  ]);
});

test("spans come back in reading order", () => {
  const spans = findMentionSpans("@Bob then @Alice", ["Alice", "Bob"]);
  assert.deepEqual(
    spans.map((span) => span.label),
    ["Bob", "Alice"],
  );
});

test("no known names means no spans", () => {
  assert.deepEqual(findMentionSpans("@Alice", []), []);
  assert.deepEqual(findMentionSpans("", ["Alice"]), []);
});
