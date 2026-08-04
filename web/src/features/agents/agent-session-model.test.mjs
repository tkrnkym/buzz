import assert from "node:assert/strict";
import test from "node:test";

import {
  diffLineParts,
  diffStat,
  eventsUpTo,
  groupSessionEvents,
  readsLabel,
  sessionSummary,
  startsExpanded,
} from "@/features/agents/agent-session-model";

/** A minimal event, so each case states only the field it is about. */
function event(overrides) {
  return {
    seq: 1,
    at: 0,
    renderClass: "message",
    tone: "neutral",
    status: "done",
    label: "何かしました",
    preview: null,
    ...overrides,
  };
}

test("consecutive reads collapse, and nothing else does", () => {
  // Eleven reads in a row is one action to someone following along; two edits in
  // a row are two things that happened.
  const groups = groupSessionEvents([
    event({ seq: 1, renderClass: "file-read" }),
    event({ seq: 2, renderClass: "file-read" }),
    event({ seq: 3, renderClass: "file-edit" }),
    event({ seq: 4, renderClass: "file-edit" }),
  ]);
  assert.deepEqual(
    groups.map((group) => group.kind),
    ["reads", "single", "single"],
  );
  assert.equal(groups[0].events.length, 2);
});

test("a read that failed stays its own row", () => {
  // The reason it failed is the only thing the reader came for, and folding it
  // into a count is how it goes unnoticed.
  const groups = groupSessionEvents([
    event({ seq: 1, renderClass: "file-read" }),
    event({ seq: 2, renderClass: "file-read", status: "failed" }),
    event({ seq: 3, renderClass: "file-read" }),
  ]);
  assert.deepEqual(
    groups.map((group) => group.kind),
    ["reads", "single", "reads"],
  );
});

test("grouping sorts by seq rather than trusting the order given", () => {
  const groups = groupSessionEvents([
    event({ seq: 3, renderClass: "file-edit", label: "三番目" }),
    event({ seq: 1, renderClass: "file-edit", label: "一番目" }),
  ]);
  assert.equal(groups[0].event.label, "一番目");
});

test("a collapsed group names the first file and counts the rest", () => {
  // A bare count hides which file; three rows for three files was the problem.
  assert.equal(
    readsLabel([event({ label: "a.rs を読みました" })]),
    "a.rs を読みました",
  );
  assert.equal(
    readsLabel([
      event({ label: "a.rs を読みました" }),
      event({ seq: 2 }),
      event({ seq: 3 }),
    ]),
    "a.rs を読みました ほか 2 件",
  );
});

test("a failure and an unfinished plan open themselves", () => {
  assert.equal(startsExpanded(event({ status: "failed" })), true);
  assert.equal(
    startsExpanded(
      event({
        detail: { kind: "todo", items: [{ text: "やる", done: false }] },
      }),
    ),
    true,
  );
  // A finished plan is history, and a shell output is a wall when eight of them
  // are open at once.
  assert.equal(
    startsExpanded(
      event({
        detail: { kind: "todo", items: [{ text: "やった", done: true }] },
      }),
    ),
    false,
  );
  assert.equal(
    startsExpanded(
      event({
        detail: { kind: "shell", command: "ls", output: "a", exitCode: 0 },
      }),
    ),
    false,
  );
});

test("the headline is the last thing that happened, not a count", () => {
  const summary = sessionSummary([
    event({ seq: 1, label: "古い" }),
    event({
      seq: 2,
      label: "いま返信しています",
      status: "running",
      tone: "write",
    }),
  ]);
  assert.equal(summary.label, "いま返信しています");
  assert.equal(summary.status, "running");
  assert.equal(summary.tone, "write");
});

test("an agent with no events says so rather than showing an empty row", () => {
  const summary = sessionSummary([]);
  assert.equal(summary.status, "empty");
  assert.equal(summary.label, "まだ何もしていません");
});

test("replay is a slice, so it never runs past either end", () => {
  const events = [event({ seq: 1 }), event({ seq: 2 }), event({ seq: 3 })];
  assert.equal(eventsUpTo(events, 0).length, 0);
  assert.equal(eventsUpTo(events, 2).length, 2);
  // Past the end and below zero both clamp, so a caller cannot produce a
  // transcript longer than the run or a negative slice.
  assert.equal(eventsUpTo(events, 99).length, 3);
  assert.equal(eventsUpTo(events, -5).length, 0);
});

test("diff lines are split so the sign is not printed twice", () => {
  assert.deepEqual(diffLineParts("+added"), { sign: "add", text: "added" });
  assert.deepEqual(diffLineParts("-gone"), { sign: "remove", text: "gone" });
  assert.deepEqual(diffLineParts(" kept"), { sign: "context", text: "kept" });
  // A context line with no leading space still reads as context rather than
  // losing its first character.
  assert.deepEqual(diffLineParts("kept"), { sign: "context", text: "kept" });
});

test("the diff stat counts only changed lines", () => {
  assert.deepEqual(diffStat([" a", "+b", "+c", "-d", " e"]), {
    added: 2,
    removed: 1,
  });
});
