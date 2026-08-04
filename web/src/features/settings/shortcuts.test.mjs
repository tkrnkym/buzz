import assert from "node:assert/strict";
import test from "node:test";

import {
  keyChips,
  SHORTCUT_GROUPS,
  SHORTCUTS,
} from "@/features/settings/shortcuts";

test("every shortcut names its keys, its action, and where it applies", () => {
  // The scope is the load-bearing field: without it, a shortcut that does nothing
  // on the screen the reader is looking at reads as broken rather than as scoped.
  for (const shortcut of SHORTCUTS) {
    assert.ok(shortcut.keys.length > 0, shortcut.action);
    assert.ok(shortcut.action, shortcut.keys.join("+"));
    assert.ok(shortcut.scope, shortcut.action);
  }
});

test("the same key can appear twice, in different scopes", () => {
  // Esc closes a dialog and also cancels a reply. Deduplicating by key would hide
  // one of the two.
  const escapes = SHORTCUTS.filter((shortcut) => shortcut.keys.includes("Esc"));
  assert.ok(escapes.length > 1);
  assert.equal(new Set(escapes.map((row) => row.scope)).size, escapes.length);
});

test("the groups cover the flat list exactly", () => {
  const grouped = SHORTCUT_GROUPS.flatMap((group) => group.items).length;
  assert.equal(grouped, SHORTCUTS.length);
});

test("each key of a shortcut has its own identity", () => {
  // A repeated key is two presses, not one; and two shortcuts can share a key.
  const chips = keyChips({
    keys: ["Shift", "Enter"],
    action: "改行する",
    scope: "入力欄",
  });
  assert.deepEqual(
    chips.map((chip) => chip.plus),
    [false, true],
  );
  assert.equal(new Set(chips.map((chip) => chip.key)).size, 2);
});
