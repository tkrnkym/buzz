import assert from "node:assert/strict";
import test from "node:test";

import {
  neighbourhood,
  resolveSelection,
  sameSelection,
} from "@/features/home/inbox-selection";

test("a notification is the default, since it named the reader", () => {
  // Same reason notifications are the first group in the list: a message with
  // your name on it outranks the news that a room moved.
  assert.deepEqual(
    resolveSelection({
      current: null,
      notificationIds: ["n1", "n2"],
      roomIds: ["c1"],
    }),
    { kind: "notification", id: "n1" },
  );
});

test("with no notifications, the first room stands in", () => {
  assert.deepEqual(
    resolveSelection({ current: null, notificationIds: [], roomIds: ["c1"] }),
    { kind: "room", channelId: "c1" },
  );
  assert.equal(
    resolveSelection({ current: null, notificationIds: [], roomIds: [] }),
    null,
  );
});

test("a selection that is still in the list is kept", () => {
  // Otherwise every arriving mention would yank the pane away from whatever the
  // reader was in the middle of reading.
  assert.deepEqual(
    resolveSelection({
      current: { kind: "notification", id: "n2" },
      notificationIds: ["n1", "n2"],
      roomIds: [],
    }),
    { kind: "notification", id: "n2" },
  );
  assert.deepEqual(
    resolveSelection({
      current: { kind: "room", channelId: "c2" },
      notificationIds: ["n1"],
      roomIds: ["c1", "c2"],
    }),
    { kind: "room", channelId: "c2" },
  );
});

test("a selection whose row is gone falls back rather than showing nothing", () => {
  // The list is live: a room read in another tab drops off it. Deriving means
  // there is never a frame of detail for a row that no longer exists.
  assert.deepEqual(
    resolveSelection({
      current: { kind: "room", channelId: "gone" },
      notificationIds: ["n1"],
      roomIds: ["c1"],
    }),
    { kind: "notification", id: "n1" },
  );
  assert.deepEqual(
    resolveSelection({
      current: { kind: "notification", id: "gone" },
      notificationIds: [],
      roomIds: ["c1"],
    }),
    { kind: "room", channelId: "c1" },
  );
});

test("selections compare by kind as well as id", () => {
  assert.equal(
    sameSelection(
      { kind: "room", channelId: "x" },
      { kind: "room", channelId: "x" },
    ),
    true,
  );
  // A notification id and a channel id are different namespaces, so a match on
  // the string alone would light the wrong row.
  assert.equal(
    sameSelection(
      { kind: "notification", id: "x" },
      { kind: "room", channelId: "x" },
    ),
    false,
  );
  assert.equal(sameSelection(null, null), true);
  assert.equal(sameSelection(null, { kind: "room", channelId: "x" }), false);
});

/** Timeline rows carry their id under `message`, which is why `idOf` is passed. */
const idOf = (item) => item.message.id;
const rowsOf = (...ns) => ns.map((n) => ({ message: { id: `m${n}` } }));

test("context is a window around the message, clamped at both ends", () => {
  const items = rowsOf(1, 2, 3, 4, 5, 6, 7);
  assert.deepEqual(neighbourhood(items, idOf, "m4", 2).map(idOf), [
    "m2",
    "m3",
    "m4",
    "m5",
    "m6",
  ]);
  // At the ends it shortens rather than wrapping or reaching past.
  assert.deepEqual(neighbourhood(items, idOf, "m1", 2).map(idOf), [
    "m1",
    "m2",
    "m3",
  ]);
  assert.deepEqual(neighbourhood(items, idOf, "m7", 2).map(idOf), [
    "m5",
    "m6",
    "m7",
  ]);
});

test("a message outside the loaded window yields no context at all", () => {
  // The first few messages of the room would look like context and be unrelated,
  // which is worse than the pane admitting it has none.
  assert.deepEqual(neighbourhood(rowsOf(1, 2), idOf, "missing", 2), []);
});
