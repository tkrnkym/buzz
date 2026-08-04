import assert from "node:assert/strict";
import test from "node:test";

import {
  channelRoster,
  rosterCounts,
  togglePane,
} from "@/features/channels/channel-roster-model";

function member(pubkey, role, timeoutUntil = null) {
  return { pubkey, role, joinedAt: 0, timeoutUntil };
}

function agent(id, channels) {
  return {
    id,
    name: id,
    pubkey: `pk-${id}`,
    purpose: "",
    status: "idle",
    activity: null,
    channels,
    lastActiveAt: 0,
  };
}

test("the roster is ordered by role, then stably", () => {
  // Role first because that is what a reader scans for; pubkey second only so
  // the order does not depend on fixture order.
  const roster = channelRoster({
    agents: [],
    channelName: "general",
    members: [
      member("cc", "member"),
      member("aa", "owner"),
      member("bb", "admin"),
      member("ab", "admin"),
    ],
  });
  assert.deepEqual(
    roster.people.map((person) => person.pubkey),
    ["aa", "ab", "bb", "cc"],
  );
});

test("only the agents assigned to this channel are in it", () => {
  const roster = channelRoster({
    agents: [agent("here", ["general", "dev"]), agent("elsewhere", ["dev"])],
    channelName: "general",
    members: [],
  });
  assert.deepEqual(
    roster.agents.map((entry) => entry.id),
    ["here"],
  );
});

test("with no channel open, no agent is claimed to be in one", () => {
  const roster = channelRoster({
    agents: [agent("here", ["general"])],
    channelName: null,
    members: [member("aa", "owner")],
  });
  assert.equal(roster.agents.length, 0);
  // The people are still the community's, which is what membership means.
  assert.equal(roster.people.length, 1);
});

test("a timeout is carried in milliseconds, since that is what the clock is in", () => {
  const roster = channelRoster({
    agents: [],
    channelName: "general",
    members: [member("aa", "member", 1_700_000_000)],
  });
  assert.equal(roster.people[0].timeoutUntilMs, 1_700_000_000_000);
});

test("people and agents are counted separately", () => {
  // "6人" for four people and two agents would overstate how many humans are
  // reachable in the room, which is the whole of what the number is for.
  assert.equal(
    rosterCounts({ people: [1, 2, 3, 4], agents: [5, 6] }),
    "4人・エージェント2",
  );
  assert.equal(rosterCounts({ people: [1, 2], agents: [] }), "2人");
});

test("the roster toggles shut, and replaces a thread rather than stacking", () => {
  assert.deepEqual(togglePane(null, { kind: "roster" }), { kind: "roster" });
  assert.equal(togglePane({ kind: "roster" }, { kind: "roster" }), null);
  assert.deepEqual(
    togglePane({ kind: "thread", rootId: "a" }, { kind: "roster" }),
    { kind: "roster" },
  );
  assert.deepEqual(
    togglePane({ kind: "roster" }, { kind: "thread", rootId: "a" }),
    { kind: "thread", rootId: "a" },
  );
});

test("asking for a different thread switches; the same one closes", () => {
  // Clicking a second thread while one is open must not blank the pane.
  assert.deepEqual(
    togglePane(
      { kind: "thread", rootId: "a" },
      { kind: "thread", rootId: "b" },
    ),
    { kind: "thread", rootId: "b" },
  );
  assert.equal(
    togglePane(
      { kind: "thread", rootId: "a" },
      { kind: "thread", rootId: "a" },
    ),
    null,
  );
});
