import assert from "node:assert/strict";
import test from "node:test";

import {
  addArchiveSubscription,
  removeArchiveSubscription,
  restoreArchivedIdentity,
} from "@/features/archive/archive-mutations";

const GONE = "9".repeat(64);
const OWNER = "1".repeat(64);

const base = () => ({
  archiveSubscriptions: [
    { id: "a1", scope: "#general", kinds: [9], events: 12, lastSyncedAt: 100 },
    { id: "a2", scope: "#dev", kinds: [9], events: 3, lastSyncedAt: 200 },
  ],
  archivedIdentities: [
    {
      pubkey: GONE,
      joinedAt: 50,
      archivedAt: 900,
      archivedBy: OWNER,
      reason: "退職",
    },
  ],
  members: [{ pubkey: OWNER, role: "owner", joinedAt: 1, timeoutUntil: null }],
});

test("removing a subscription takes the row away", () => {
  const next = removeArchiveSubscription(base(), "a1");
  assert.deepEqual(
    next.archiveSubscriptions.map((row) => row.id),
    ["a2"],
  );
});

test("a new subscription starts empty but synced now", () => {
  // A brand-new row reporting "synced 55 years ago" reads as broken.
  const next = addArchiveSubscription(base(), {
    id: "a3",
    scope: "#design",
    kinds: [9, 7],
    at: 1_000,
  });
  const added = next.archiveSubscriptions.at(-1);
  assert.equal(added.id, "a3");
  assert.equal(added.events, 0);
  assert.equal(added.lastSyncedAt, 1_000);
});

test("restoring moves the person out of the archive and back into members", () => {
  // An archive is a move, not a flag. Doing only half would leave them neither
  // archived nor a member — invisible everywhere.
  const next = restoreArchivedIdentity(base(), GONE);
  assert.equal(next.archivedIdentities.length, 0);
  const restored = next.members.find((row) => row.pubkey === GONE);
  assert.equal(restored.role, "member");
  // The join date travels with the archive, so the restore is lossless.
  assert.equal(restored.joinedAt, 50);
  assert.equal(restored.timeoutUntil, null);
});

test("restoring someone who is somehow already a member does not duplicate them", () => {
  const state = base();
  state.members.push({
    pubkey: GONE,
    role: "admin",
    joinedAt: 50,
    timeoutUntil: null,
  });
  const next = restoreArchivedIdentity(state, GONE);
  assert.equal(next.members.filter((row) => row.pubkey === GONE).length, 1);
  // And the role they already had is left alone rather than demoted.
  assert.equal(next.members.find((row) => row.pubkey === GONE).role, "admin");
});

test("restoring an unknown pubkey changes nothing at all", () => {
  const state = base();
  assert.equal(restoreArchivedIdentity(state, "0".repeat(64)), state);
});
