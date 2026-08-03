import assert from "node:assert/strict";
import test from "node:test";

import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  clampSidebarWidth,
  magnetizeSidebarWidth,
} from "@/shared/ui/sidebar-width";

test("a width outside the range is pulled to the nearest bound", () => {
  assert.equal(clampSidebarWidth(0), SIDEBAR_WIDTH_MIN);
  assert.equal(clampSidebarWidth(10_000), SIDEBAR_WIDTH_MAX);
  assert.equal(clampSidebarWidth(260.4), 260);
});

test("dragging inside the snap distance lands exactly on the default", () => {
  for (const offset of [-8, -3, 0, 3, 8]) {
    assert.equal(
      magnetizeSidebarWidth(SIDEBAR_WIDTH_DEFAULT + offset),
      SIDEBAR_WIDTH_DEFAULT,
      `offset ${offset} should snap`,
    );
  }
});

test("dragging past the magnet distance is unaffected by the detent", () => {
  const far = SIDEBAR_WIDTH_DEFAULT + 60;
  assert.equal(magnetizeSidebarWidth(far), far);
});

test("the detent eases out rather than jumping", () => {
  // Between the snap and magnet distances the result trails the raw width — the
  // sidebar still moves, it just resists. A step function here would make the
  // handle visibly stick and then leap.
  const raw = SIDEBAR_WIDTH_DEFAULT + 20;
  const eased = magnetizeSidebarWidth(raw);
  assert.ok(
    eased > SIDEBAR_WIDTH_DEFAULT && eased < raw,
    `expected ${SIDEBAR_WIDTH_DEFAULT} < ${eased} < ${raw}`,
  );
});

test("the detent is symmetric around the default", () => {
  const above = magnetizeSidebarWidth(SIDEBAR_WIDTH_DEFAULT + 20);
  const below = magnetizeSidebarWidth(SIDEBAR_WIDTH_DEFAULT - 20);
  assert.equal(above - SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_DEFAULT - below);
});

test("the magnetized width never escapes the clamp", () => {
  assert.equal(magnetizeSidebarWidth(-500), SIDEBAR_WIDTH_MIN);
  assert.equal(magnetizeSidebarWidth(5_000), SIDEBAR_WIDTH_MAX);
});
