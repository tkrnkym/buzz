import assert from "node:assert/strict";
import test from "node:test";

import {
  findSettingsPanel,
  resolveSettingsPanel,
  SETTINGS_GROUPS,
  SETTINGS_PANELS,
} from "@/features/settings/settings-nav";

test("the nav is three groups and twenty screens", () => {
  assert.deepEqual(
    SETTINGS_GROUPS.map((group) => group.label),
    ["Personal", "Communities", "App"],
  );
  assert.equal(SETTINGS_PANELS.length, 20);
});

test("every panel has an id, a label, an icon, and a description", () => {
  // The description is the line under the screen's title, so a panel without one
  // would render a heading with nothing saying what the screen is for.
  for (const panel of SETTINGS_PANELS) {
    assert.ok(panel.id, "id");
    assert.ok(panel.label, `${panel.id}: label`);
    assert.ok(panel.Icon, `${panel.id}: Icon`);
    assert.ok(panel.description, `${panel.id}: description`);
  }
});

test("ids are unique, since they are the URL", () => {
  const ids = SETTINGS_PANELS.map((panel) => panel.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the flat list follows nav order", () => {
  // The list drives keyboard order and the URL space, so it cannot be a set.
  assert.equal(SETTINGS_PANELS[0].id, "profile");
  assert.equal(SETTINGS_PANELS.at(-1).id, "updates");
});

test("an unknown panel falls back rather than failing the page", () => {
  // A stale or hand-edited link should still open Settings; which panel it named
  // is not load-bearing enough to 404 over.
  assert.equal(resolveSettingsPanel("appearance"), "appearance");
  assert.equal(resolveSettingsPanel("nope"), "profile");
  assert.equal(resolveSettingsPanel(undefined), "profile");
  assert.equal(findSettingsPanel("nope"), null);
  assert.equal(findSettingsPanel("voice").label, "Voice");
});

test("a screen may have a longer heading than its nav row", () => {
  // "Compute" is enough in a column of fifteen; the heading has a whole line to be
  // specific with, and falls back to the nav label when there is nothing to add.
  const compute = findSettingsPanel("compute");
  assert.equal(compute.label, "Compute");
  assert.equal(compute.title, "Share compute");
  assert.equal(findSettingsPanel("profile").title, undefined);
});
