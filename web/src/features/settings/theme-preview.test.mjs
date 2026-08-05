import assert from "node:assert/strict";
import test from "node:test";

import { createThemeVars } from "@/shared/theme/adaptive-theme";
import {
  themePreview,
  WINDOW_CONTROLS,
} from "@/features/settings/theme-preview";

// GitHub Light and GitHub Dark, as the loader would hand them over.
const LIGHT = createThemeVars("#ffffff", "#1f2328", "#6e7781");
const DARK = createThemeVars("#0d1117", "#e6edf3", "#8b949e");

test("every region is a usable colour, not bare HSL components", () => {
  // The variables are "210 6% 12%" so Tailwind can wrap them; an inline style needs
  // the whole function or the region paints nothing at all.
  for (const value of Object.values(themePreview(LIGHT.vars))) {
    assert.match(value, /^hsl\([\d.]+ [\d.]+% [\d.]+%\)$/);
  }
});

test("the thumbnail's regions come from the app's own surfaces", () => {
  const preview = themePreview(DARK.vars);
  assert.equal(preview.chrome, `hsl(${DARK.vars["--sidebar-background"]})`);
  assert.equal(preview.content, `hsl(${DARK.vars["--background"]})`);
  assert.equal(preview.dock, `hsl(${DARK.vars["--huddle-control-surface"]})`);
});

test("chrome and content differ, or the thumbnail is one flat rectangle", () => {
  for (const theme of [LIGHT, DARK]) {
    const preview = themePreview(theme.vars);
    assert.notEqual(preview.chrome, preview.content);
    assert.notEqual(preview.text, preview.muted);
  }
});

test("the bottom band stays dark under a light theme", () => {
  // It is the huddle bar, which the app paints near-black regardless — the one
  // region that makes the little picture recognisable as this window.
  const lightness = (value) => Number(/ ([\d.]+)%\)$/.exec(value)[1]);
  assert.ok(lightness(themePreview(LIGHT.vars).dock) < 30);
});

test("the window controls are the OS's colours, not the theme's", () => {
  assert.deepEqual(
    WINDOW_CONTROLS.map((control) => control.id),
    ["close", "minimize", "zoom"],
  );
  for (const control of WINDOW_CONTROLS) {
    assert.match(control.color, /^#[0-9a-f]{6}$/);
  }
});
