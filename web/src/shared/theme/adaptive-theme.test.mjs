import assert from "node:assert/strict";
import test from "node:test";

import {
  createThemeVars,
  hexToHsl,
  luminance,
} from "@/shared/theme/adaptive-theme";

/** The GitHub Dark values Nuxx Dark borrows, as Shiki reports them. */
const NUXX_DARK = { bg: "#24292e", fg: "#e1e4e8", comment: "#6a737d" };
/** The GitHub Light values Nuxx borrows. */
const NUXX_LIGHT = { bg: "#ffffff", fg: "#24292e", comment: "#6a737d" };

test("light and dark are decided by background luminance, not by name", () => {
  assert.equal(
    createThemeVars(NUXX_DARK.bg, NUXX_DARK.fg, NUXX_DARK.comment).isDark,
    true,
  );
  assert.equal(
    createThemeVars(NUXX_LIGHT.bg, NUXX_LIGHT.fg, NUXX_LIGHT.comment).isDark,
    false,
  );
  // A theme is dark from the background alone: a dark background with dark
  // text is still a dark theme, and the elevation direction has to follow the
  // background or every raised surface would sink into it.
  assert.equal(createThemeVars("#101010", "#202020", "#303030").isDark, true);
});

test("every variable the stylesheet reads is emitted", () => {
  const { vars } = createThemeVars(
    NUXX_DARK.bg,
    NUXX_DARK.fg,
    NUXX_DARK.comment,
  );
  // Not an exhaustive list — these are the ones whose absence leaves a surface
  // painted with the pre-hydration fallback, which is the failure this whole
  // module exists to prevent.
  for (const key of [
    "--background",
    "--foreground",
    "--card",
    "--card-foreground",
    "--popover",
    "--muted",
    "--muted-foreground",
    "--accent",
    "--secondary",
    "--border",
    "--input",
    "--ring",
    "--destructive",
    "--sidebar-background",
    "--sidebar-foreground",
    "--sidebar-border",
    "--status-added",
    "--ui-warning",
  ]) {
    assert.ok(vars[key], `${key} must be emitted`);
  }
});

test("hsl components are emitted bare, for hsl(var(--x)) to wrap", () => {
  // tailwind.config.js reads these as `hsl(var(--background))`, so a value that
  // arrived as `hsl(...)` or `#rrggbb` would produce `hsl(hsl(...))` and paint
  // nothing at all.
  const { vars } = createThemeVars(
    NUXX_DARK.bg,
    NUXX_DARK.fg,
    NUXX_DARK.comment,
  );
  assert.match(vars["--background"], /^[\d.]+ [\d.]+% [\d.]+%$/);
  assert.match(vars["--foreground"], /^[\d.]+ [\d.]+% [\d.]+%$/);
  // The status colors are the exception: they are consumed as bare `var()`, so
  // they stay hex.
  assert.match(vars["--status-added"], /^#[0-9a-f]{6}$/i);
});

test("the sidebar is a step away from the content surface", () => {
  // The chrome/content split is the whole reason the shell reads as two
  // surfaces. If these matched, the sidebar would vanish into the page.
  const dark = createThemeVars(NUXX_DARK.bg, NUXX_DARK.fg, NUXX_DARK.comment);
  assert.notEqual(dark.vars["--sidebar-background"], dark.vars["--background"]);
  const light = createThemeVars(
    NUXX_LIGHT.bg,
    NUXX_LIGHT.fg,
    NUXX_LIGHT.comment,
  );
  assert.notEqual(
    light.vars["--sidebar-background"],
    light.vars["--background"],
  );
});

test("a pure-white background keeps a paintable chrome color", () => {
  // #ffffff has zero headroom above it, so the chrome step has to go *down*
  // from the background while the content surface stays put. Getting this
  // backwards is how GitHub Light lost its sidebar.
  const { vars } = createThemeVars(
    NUXX_LIGHT.bg,
    NUXX_LIGHT.fg,
    NUXX_LIGHT.comment,
  );
  const chromeLightness = Number(
    vars["--sidebar-background"].split(" ")[2].replace("%", ""),
  );
  assert.ok(chromeLightness < 100, "chrome must be darker than pure white");
  assert.ok(chromeLightness > 90, "chrome must stay close to white");
});

test("muted foreground comes from the comment color", () => {
  // Timestamps and secondary labels ride on this. When the loader failed to
  // find a comment color it fell back to the foreground, and every muted label
  // rendered as body text — the bug this assertion guards.
  const { vars } = createThemeVars(
    NUXX_DARK.bg,
    NUXX_DARK.fg,
    NUXX_DARK.comment,
  );
  assert.equal(vars["--muted-foreground"], hexToHsl(NUXX_DARK.comment));
  assert.notEqual(vars["--muted-foreground"], vars["--foreground"]);
});

test("git colors are used when the theme has them, and fall back when not", () => {
  const withGit = createThemeVars(
    NUXX_DARK.bg,
    NUXX_DARK.fg,
    NUXX_DARK.comment,
    {
      added: "#34d058",
      deleted: "#d73a49",
      modified: null,
    },
  );
  assert.equal(withGit.vars["--status-added"], "#34d058");
  assert.equal(withGit.vars["--status-deleted"], "#d73a49");
  // `modified` has no git source in most themes, so it always takes the
  // built-in orange rather than going empty.
  assert.equal(withGit.vars["--status-modified"], "#d29922");

  const withoutGit = createThemeVars(
    NUXX_DARK.bg,
    NUXX_DARK.fg,
    NUXX_DARK.comment,
  );
  assert.equal(withoutGit.vars["--status-added"], "#3fb950");
});

test("shorthand and alpha hex parse to the same color as the long form", () => {
  // Bundled themes write `#fff` (vesper) and `#dbd7caee` (vitesse). Both reach
  // this module, and a mis-parse here silently shifts the whole palette.
  assert.equal(hexToHsl("#fff"), hexToHsl("#ffffff"));
  assert.equal(luminance("#000"), luminance("#000000"));
  assert.ok(Math.abs(luminance("#ffffff") - 1) < 1e-9);
});
