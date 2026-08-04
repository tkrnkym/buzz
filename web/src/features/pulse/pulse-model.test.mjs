import assert from "node:assert/strict";
import test from "node:test";

import {
  cardKind,
  hasFailure,
  pulseEntriesFor,
  pulseTabCounts,
} from "@/features/pulse/pulse-model";

function entry(overrides) {
  return {
    id: "p1",
    tab: "notes",
    authorPubkey: "a".repeat(64),
    title: "何か",
    body: "本文",
    channel: null,
    at: 0,
    reactions: [],
    ...overrides,
  };
}

test("an agent's failure is its own kind of card", () => {
  assert.equal(cardKind(entry({ tab: "notes" })), "note");
  assert.equal(
    cardKind(entry({ tab: "agents", outcome: "ok" })),
    "agent-report",
  );
  assert.equal(
    cardKind(entry({ tab: "agents", outcome: "failed" })),
    "agent-failure",
  );
});

test("an agent entry with no recorded outcome reads as an ordinary report", () => {
  // Absent is not "failed": claiming a run broke because nothing said it
  // succeeded would cry wolf on every entry written before the field existed.
  assert.equal(cardKind(entry({ tab: "agents" })), "agent-report");
});

test("a note is never a failure, whatever it says", () => {
  // Read off `outcome`, not the prose: a note *about* an outage is still a note,
  // and scanning the body for 「失敗」 would light it up as a stopped agent.
  assert.equal(
    cardKind(entry({ tab: "notes", body: "デプロイが失敗したときの手順" })),
    "note",
  );
});

test("entries are newest first, and a failure does not jump the queue", () => {
  // A record, not a queue. An entry that changes position is one the reader
  // cannot find again; the card carries the urgency instead.
  const ordered = pulseEntriesFor(
    [
      entry({ id: "old", at: 10 }),
      entry({ id: "broken", at: 20, tab: "agents", outcome: "failed" }),
      entry({ id: "new", at: 30 }),
    ],
    "all",
  );
  assert.deepEqual(
    ordered.map((item) => item.id),
    ["new", "broken", "old"],
  );
});

test("a tab shows only its own entries", () => {
  const entries = [
    entry({ id: "n", tab: "notes" }),
    entry({ id: "a", tab: "agents" }),
  ];
  assert.deepEqual(
    pulseEntriesFor(entries, "notes").map((item) => item.id),
    ["n"],
  );
  assert.deepEqual(
    pulseEntriesFor(entries, "agents").map((item) => item.id),
    ["a"],
  );
});

test("sorting does not mutate what it was given", () => {
  // The fixtures are shared state; sorting in place would reorder them for every
  // other screen that reads the same array.
  const entries = [entry({ id: "a", at: 1 }), entry({ id: "b", at: 2 })];
  pulseEntriesFor(entries, "all");
  assert.deepEqual(
    entries.map((item) => item.id),
    ["a", "b"],
  );
});

test("the tabs carry counts, so an empty one is distinguishable", () => {
  const counts = pulseTabCounts([
    entry({ tab: "notes" }),
    entry({ tab: "notes" }),
    entry({ tab: "agents" }),
  ]);
  assert.deepEqual(counts, { all: 3, notes: 2, agents: 1 });
});

test("a failure anywhere is reported, so the tab can say so before it is opened", () => {
  assert.equal(hasFailure([entry({ tab: "notes" })]), false);
  assert.equal(hasFailure([entry({ tab: "agents", outcome: "failed" })]), true);
});
