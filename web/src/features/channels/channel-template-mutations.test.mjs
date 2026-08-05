import assert from "node:assert/strict";
import test from "node:test";

import {
  addChannelTemplate,
  duplicateChannelTemplate,
  removeChannelTemplate,
  updateChannelTemplate,
} from "@/features/channels/channel-template-mutations";

const template = (overrides) => ({
  id: "t1",
  name: "設計レビュー",
  description: "",
  canvasTemplate: "",
  agentIds: [],
  usedCount: 4,
  ...overrides,
});

const base = () => ({
  channelTemplates: [template(), template({ id: "t2", name: "定例" })],
});

test("a template is added, updated, and removed", () => {
  const added = addChannelTemplate(
    base(),
    template({ id: "t3", name: "新規" }),
  );
  assert.equal(added.channelTemplates.length, 3);

  const renamed = updateChannelTemplate(
    added,
    template({ id: "t3", name: "改名" }),
  );
  assert.equal(
    renamed.channelTemplates.find((row) => row.id === "t3").name,
    "改名",
  );

  const removed = removeChannelTemplate(renamed, "t3");
  assert.deepEqual(
    removed.channelTemplates.map((row) => row.id),
    ["t1", "t2"],
  );
});

test("a copy lands next to the original and starts with no history", () => {
  const next = duplicateChannelTemplate(base(), "t1", "t9");
  // Beside the original, so it appears where the reader was looking.
  assert.deepEqual(
    next.channelTemplates.map((row) => row.id),
    ["t1", "t9", "t2"],
  );
  const copy = next.channelTemplates[1];
  assert.equal(copy.name, "設計レビュー のコピー");
  // `usedCount` is how often *this* template made a channel; inheriting 4 would
  // credit the copy with history it does not have.
  assert.equal(copy.usedCount, 0);
});

test("duplicating something that is not there changes nothing", () => {
  const state = base();
  assert.equal(duplicateChannelTemplate(state, "missing", "t9"), state);
});
