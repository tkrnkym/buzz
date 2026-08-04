import assert from "node:assert/strict";
import test from "node:test";

import {
  accentVars,
  getContrastColor,
  isNuxxTheme,
  NEUTRAL_ACCENT,
  resolveEffectiveAccent,
} from "@/shared/theme/accent";
import {
  applyMode,
  modeFor,
  previewThemeFrom,
  readStoredFollowSystem,
  readStoredTheme,
} from "@/shared/theme/theme-mode";

test("the three legacy stored values migrate to the Nuxx pair", () => {
  // These readers stored light/dark/system before a theme name meant anything.
  assert.equal(readStoredTheme("light", "nuxx"), "nuxx");
  assert.equal(readStoredTheme("system", "nuxx"), "nuxx");
  assert.equal(readStoredTheme("dark", "nuxx"), "nuxx-dark");
});

test("an unknown stored theme falls back instead of throwing", () => {
  assert.equal(readStoredTheme("solarized-teal", "nuxx"), "nuxx");
  assert.equal(readStoredTheme(null, "nuxx"), "nuxx");
  assert.equal(readStoredTheme("", "nuxx"), "nuxx");
  // A real name survives.
  assert.equal(readStoredTheme("vitesse-dark", "nuxx"), "vitesse-dark");
});

test("follow-system: explicit choice wins, then legacy, then fresh profile", () => {
  assert.equal(readStoredFollowSystem("false", "system"), false);
  assert.equal(readStoredFollowSystem("true", "vitesse-dark"), true);
  // No explicit flag, but the legacy value asked to follow the OS.
  assert.equal(readStoredFollowSystem(null, "system"), true);
  // A reader who picked a fixed theme before the flag existed keeps it fixed.
  assert.equal(readStoredFollowSystem(null, "vitesse-dark"), false);
  // Fresh profile follows the OS, so a first run in dark mode is not blinding.
  assert.equal(readStoredFollowSystem(null, null), true);
});

test("picking a mode keeps the reader's theme family", () => {
  // Someone on vitesse-dark who picks Light gets vitesse-light, not the default.
  assert.deepEqual(applyMode("vitesse-dark", "light"), {
    theme: "vitesse-light",
    followSystem: false,
  });
  assert.deepEqual(applyMode("catppuccin-latte", "dark"), {
    theme: "catppuccin-mocha",
    followSystem: false,
  });
});

test("a mode that the theme already satisfies changes only follow-system", () => {
  assert.deepEqual(applyMode("vitesse-dark", "dark"), {
    theme: "vitesse-dark",
    followSystem: false,
  });
  assert.deepEqual(applyMode("nuxx", "light"), {
    theme: "nuxx",
    followSystem: false,
  });
});

test("system mode leaves the theme alone", () => {
  // The theme is the family; the OS picks which half of it to show.
  assert.deepEqual(applyMode("vitesse-dark", "system"), {
    theme: "vitesse-dark",
    followSystem: true,
  });
});

test("an unpaired theme is kept rather than swapped to satisfy the toggle", () => {
  // monokai is dark and has no light counterpart. Honouring "light" here would
  // mean throwing away the theme the reader chose.
  assert.deepEqual(applyMode("monokai", "light"), {
    theme: "monokai",
    followSystem: false,
  });
});

test("the toggle reports system before it reports light or dark", () => {
  assert.equal(modeFor(true, true), "system");
  assert.equal(modeFor(true, false), "system");
  assert.equal(modeFor(false, true), "dark");
  assert.equal(modeFor(false, false), "light");
});

test("previewTheme accepts a theme name and the two legacy words", () => {
  assert.equal(previewThemeFrom("?previewTheme=vitesse-dark"), "vitesse-dark");
  assert.equal(previewThemeFrom("?previewTheme=dark"), "nuxx-dark");
  assert.equal(previewThemeFrom("?previewTheme=light"), "nuxx");
  assert.equal(previewThemeFrom("?previewTheme=not-a-theme"), null);
  assert.equal(previewThemeFrom(""), null);
});

test("Nuxx themes are pinned to the neutral accent, others are not", () => {
  assert.equal(isNuxxTheme("nuxx"), true);
  assert.equal(isNuxxTheme("nuxx-dark"), true);
  assert.equal(isNuxxTheme("vitesse-dark"), false);
  // The stored accent is passed through untouched for a non-Nuxx theme, and
  // overridden — not erased — for a Nuxx one.
  assert.equal(resolveEffectiveAccent("nuxx", "#6366f1"), NEUTRAL_ACCENT);
  assert.equal(resolveEffectiveAccent("vitesse-dark", "#6366f1"), "#6366f1");
});

test("the neutral accent borrows the theme's own colors", () => {
  const vars = accentVars(NEUTRAL_ACCENT, "40 10% 90%", "0 0% 10%");
  assert.equal(vars["--primary"], "40 10% 90%");
  assert.equal(vars["--primary-foreground"], "0 0% 10%");
  // The active nav row follows the same pair, or the selection would read as a
  // different color from the primary button.
  assert.equal(vars["--sidebar-active"], "40 10% 90%");
});

test("a colored accent carries a legible foreground", () => {
  const indigo = accentVars("#6366f1", "0 0% 100%", "0 0% 0%");
  // Indigo is dark enough to need white text.
  assert.equal(indigo["--primary-foreground"], "0 0% 100.0%");
  assert.notEqual(indigo["--primary"], "0 0% 100%");

  // A light accent flips to black text rather than staying white-on-white.
  const orange = accentVars("#f97316", "0 0% 100%", "0 0% 0%");
  assert.equal(getContrastColor("#f97316"), "#000000");
  assert.equal(orange["--primary-foreground"], "0 0% 0.0%");
});
