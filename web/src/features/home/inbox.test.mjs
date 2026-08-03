import assert from "node:assert/strict";
import test from "node:test";

import { buildInbox } from "@/features/home/inbox";

const channel = (id, name) => ({
  id,
  name,
  about: null,
  topic: null,
  type: "stream",
  isPrivate: false,
  hidden: false,
  archived: false,
  updatedAt: 0,
});

const CHANNELS = [
  channel("c-general", "general"),
  channel("c-design", "design"),
  channel("c-random", "random"),
];

const from = (unreadIds, activity = {}) =>
  buildInbox({
    channels: CHANNELS,
    isUnread: (id) => unreadIds.includes(id),
    lastActivityAt: (id) => activity[id] ?? null,
  });

test("only unread rooms are listed", () => {
  const rows = from(["c-design"]);
  assert.deepEqual(
    rows.map((row) => row.channel.id),
    ["c-design"],
  );
});

test("an inbox with nothing unread is empty, not the whole channel list", () => {
  assert.deepEqual(from([]), []);
});

test("rooms are ordered by most recent activity", () => {
  const rows = from(["c-general", "c-design", "c-random"], {
    "c-general": 100,
    "c-design": 300,
    "c-random": 200,
  });
  assert.deepEqual(
    rows.map((row) => row.channel.id),
    ["c-design", "c-random", "c-general"],
  );
});

test("an unread room with no known activity time is still listed", () => {
  // It was reported unread; dropping it would hide exactly what the inbox is
  // for. It just cannot claim a position among the timestamped rooms.
  const rows = from(["c-general", "c-design"], { "c-design": 300 });
  assert.deepEqual(
    rows.map((row) => row.channel.id),
    ["c-design", "c-general"],
  );
  assert.equal(rows[1].lastActivityAt, null);
});

test("rooms with no known time sort alphabetically, not arbitrarily", () => {
  const rows = from(["c-random", "c-general", "c-design"]);
  assert.deepEqual(
    rows.map((row) => row.channel.name),
    ["design", "general", "random"],
  );
});

test("equal timestamps break to the name so the order is stable", () => {
  const rows = from(["c-random", "c-design"], {
    "c-design": 200,
    "c-random": 200,
  });
  assert.deepEqual(
    rows.map((row) => row.channel.name),
    ["design", "random"],
  );
});
