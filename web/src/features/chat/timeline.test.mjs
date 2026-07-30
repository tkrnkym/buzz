import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveTimeline,
  mergeEvents,
  reactableIds,
  reactionEventIds,
} from "@/features/chat/timeline";

const ME = "aa".repeat(32);
const OTHER = "bb".repeat(32);

const event = (overrides) => ({
  id: "id",
  pubkey: OTHER,
  kind: 9,
  created_at: 1_700_000_000,
  tags: [["h", "chan-1"]],
  content: "",
  sig: "sig".padEnd(128, "0"),
  ...overrides,
});

/** Build the id-keyed accumulator the derivation reads. */
const store = (...events) => mergeEvents(new Map(), events);

test("mergeEvents dedupes replays and keeps identity when unchanged", () => {
  const first = store(event({ id: "a" }), event({ id: "b" }));
  assert.equal(first.size, 2);

  // A reconnect re-sends the same filter, so repeat delivery is the norm.
  assert.equal(mergeEvents(first, [event({ id: "a" })]), first);
  assert.notEqual(mergeEvents(first, [event({ id: "c" })]), first);
});

test("rows are ordered oldest first with a deterministic tiebreak", () => {
  const rows = deriveTimeline(
    store(
      event({ id: "bbb", created_at: 100 }),
      event({ id: "aaa", created_at: 100 }),
      event({ id: "ccc", created_at: 50 }),
    ),
    ME,
  );
  assert.deepEqual(
    rows.map((row) => row.message.id),
    ["ccc", "aaa", "bbb"],
  );
});

test("derivation is independent of arrival order", () => {
  // A reaction can arrive before the message it reacts to.
  const message = event({ id: "msg", content: "hi" });
  const reaction = event({
    id: "r1",
    kind: 7,
    pubkey: ME,
    content: "👍",
    tags: [["e", "msg"]],
  });

  const forward = deriveTimeline(store(message, reaction), ME);
  const reverse = deriveTimeline(store(reaction, message), ME);
  assert.deepEqual(forward, reverse);
  assert.equal(forward[0].reactions[0].count, 1);
});

test("reactions are grouped by emoji and count distinct reactors", () => {
  const rows = deriveTimeline(
    store(
      event({ id: "msg" }),
      event({
        id: "r1",
        kind: 7,
        pubkey: ME,
        content: "👍",
        tags: [["e", "msg"]],
      }),
      event({
        id: "r2",
        kind: 7,
        pubkey: OTHER,
        content: "👍",
        tags: [["e", "msg"]],
      }),
      event({
        id: "r3",
        kind: 7,
        pubkey: OTHER,
        content: "🎉",
        tags: [["e", "msg"]],
      }),
    ),
    ME,
  );

  // Sorted by count, so the busiest reaction reads first.
  assert.deepEqual(
    rows[0].reactions.map((reaction) => [reaction.emoji, reaction.count]),
    [
      ["👍", 2],
      ["🎉", 1],
    ],
  );
  assert.equal(rows[0].reactions[0].mine, true);
  assert.equal(rows[0].reactions[0].myReactionId, "r1");
  assert.equal(rows[0].reactions[1].mine, false);
});

test("one reactor counts once per emoji", () => {
  const rows = deriveTimeline(
    store(
      event({ id: "msg" }),
      event({
        id: "r1",
        kind: 7,
        pubkey: ME,
        content: "👍",
        tags: [["e", "msg"]],
      }),
      event({
        id: "r2",
        kind: 7,
        pubkey: ME,
        content: "👍",
        tags: [["e", "msg"]],
      }),
    ),
    ME,
  );
  assert.equal(rows[0].reactions[0].count, 1);
});

test("a withdrawn reaction disappears", () => {
  // Withdrawal is a kind:5 against the reaction event, not the message.
  const rows = deriveTimeline(
    store(
      event({ id: "msg" }),
      event({
        id: "r1",
        kind: 7,
        pubkey: ME,
        content: "👍",
        tags: [["e", "msg"]],
      }),
      event({ id: "d1", kind: 5, pubkey: ME, tags: [["e", "r1"]] }),
    ),
    ME,
  );
  assert.deepEqual(rows[0].reactions, []);
  assert.equal(rows[0].deleted, false, "the message itself must survive");
});

test("a custom emoji reaction carries its image url", () => {
  const rows = deriveTimeline(
    store(
      event({ id: "msg" }),
      event({
        id: "r1",
        kind: 7,
        pubkey: OTHER,
        content: ":partyparrot:",
        tags: [
          ["e", "msg"],
          ["emoji", "partyparrot", "https://media.example/parrot.gif"],
        ],
      }),
    ),
    ME,
  );
  assert.equal(
    rows[0].reactions[0].emojiUrl,
    "https://media.example/parrot.gif",
  );
});

test("the newest edit by the original author replaces the content", () => {
  const rows = deriveTimeline(
    store(
      event({ id: "msg", pubkey: OTHER, content: "first" }),
      event({
        id: "e1",
        kind: 40003,
        pubkey: OTHER,
        created_at: 1_700_000_100,
        content: "second",
        tags: [
          ["h", "chan-1"],
          ["e", "msg"],
        ],
      }),
      event({
        id: "e2",
        kind: 40003,
        pubkey: OTHER,
        created_at: 1_700_000_200,
        content: "third",
        tags: [
          ["h", "chan-1"],
          ["e", "msg"],
        ],
      }),
    ),
    ME,
  );
  assert.equal(rows[0].content, "third");
  assert.equal(rows[0].edited, true);
});

test("an edit from anyone but the author is ignored", () => {
  // Rendering a third party's rewrite would put words in the author's mouth on
  // the strength of a single server.
  const rows = deriveTimeline(
    store(
      event({ id: "msg", pubkey: OTHER, content: "original" }),
      event({
        id: "e1",
        kind: 40003,
        pubkey: ME,
        created_at: 1_700_000_100,
        content: "tampered",
        tags: [
          ["h", "chan-1"],
          ["e", "msg"],
        ],
      }),
    ),
    ME,
  );
  assert.equal(rows[0].content, "original");
  assert.equal(rows[0].edited, false);
});

test("both delete kinds tombstone a message", () => {
  for (const kind of [5, 9005]) {
    const rows = deriveTimeline(
      store(
        event({ id: "msg", content: "gone soon" }),
        event({
          id: "d1",
          kind,
          tags: [
            ["h", "chan-1"],
            ["e", "msg"],
          ],
        }),
      ),
      ME,
    );
    assert.equal(rows[0].deleted, true, `kind ${kind}`);
    // The row survives as a tombstone: a reader following a reply needs to see
    // that the parent existed.
    assert.equal(rows.length, 1);
  }
});

test("a moderator tombstone surfaces its public reason", () => {
  const rows = deriveTimeline(
    store(
      event({ id: "msg" }),
      event({
        id: "d1",
        kind: 9005,
        tags: [
          ["h", "chan-1"],
          ["e", "msg"],
          ["reason_code", "spam"],
          ["public_reason", "Removed as spam"],
        ],
      }),
    ),
    ME,
  );
  assert.equal(rows[0].deletedReason, "Removed as spam");
});

test("reply counts come from loaded direct replies", () => {
  const rows = deriveTimeline(
    store(
      event({ id: "root", created_at: 10 }),
      event({
        id: "r1",
        created_at: 20,
        tags: [
          ["h", "chan-1"],
          ["e", "root", "", "reply"],
        ],
      }),
      event({
        id: "r2",
        created_at: 30,
        tags: [
          ["h", "chan-1"],
          ["e", "root", "", "reply"],
        ],
      }),
      event({
        id: "nested",
        created_at: 40,
        tags: [
          ["h", "chan-1"],
          ["e", "root", "", "root"],
          ["e", "r1", "", "reply"],
        ],
      }),
    ),
    ME,
  );

  const byId = new Map(rows.map((row) => [row.message.id, row]));
  assert.equal(byId.get("root").replyCount, 2);
  assert.equal(
    byId.get("r1").replyCount,
    1,
    "nested reply counts on its parent",
  );
  assert.equal(byId.get("r2").replyCount, 0);
});

test("reactable ids exclude system rows", () => {
  const rows = deriveTimeline(
    store(
      event({ id: "msg" }),
      event({ id: "sys", kind: 40099, content: "{}" }),
    ),
    ME,
  );
  assert.deepEqual(reactableIds(rows), ["msg"]);
});

test("reactionEventIds lists every reactor, not just mine", () => {
  // Another person's withdrawal changes the count everyone sees, so all reaction
  // events have to be watched.
  const events = store(
    event({ id: "msg" }),
    event({
      id: "r1",
      kind: 7,
      pubkey: ME,
      content: "👍",
      tags: [["e", "msg"]],
    }),
    event({
      id: "r2",
      kind: 7,
      pubkey: OTHER,
      content: "🎉",
      tags: [["e", "msg"]],
    }),
  );
  assert.deepEqual(reactionEventIds(events).sort(), ["r1", "r2"]);
});

test("a reaction with no emoji content is ignored", () => {
  const rows = deriveTimeline(
    store(
      event({ id: "msg" }),
      event({
        id: "r1",
        kind: 7,
        pubkey: ME,
        content: "  ",
        tags: [["e", "msg"]],
      }),
    ),
    ME,
  );
  assert.deepEqual(rows[0].reactions, []);
});

test("mine is never set without a known reader pubkey", () => {
  const rows = deriveTimeline(
    store(
      event({ id: "msg" }),
      event({
        id: "r1",
        kind: 7,
        pubkey: ME,
        content: "👍",
        tags: [["e", "msg"]],
      }),
    ),
    null,
  );
  assert.equal(rows[0].reactions[0].mine, false);
  assert.equal(rows[0].reactions[0].myReactionId, undefined);
});
