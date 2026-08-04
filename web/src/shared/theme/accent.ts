/**
 * Accent color.
 *
 * The syntax theme decides every surface and text color (see
 * `adaptive-theme.ts`); the accent decides the one color that is *chosen* rather
 * than derived — primary buttons, the selected nav row, focus fills. Keeping it
 * separate is what lets the same theme read as a different product, and it is
 * why the original app's Create buttons are indigo rather than the theme's
 * near-black foreground.
 *
 * Ported from the desktop client's `ThemeProvider` (commit 02749b3^). The
 * video-review accent vars it also wrote are omitted: that surface is a desktop
 * feature with no web counterpart, and writing vars nothing reads is how the
 * dead `--nuxx-*` tokens got here in the first place.
 */

import { hexToHsl } from "./adaptive-theme";

/** The accent that means "use the theme's own foreground", not a color. */
export const NEUTRAL_ACCENT = "neutral";

export const ACCENT_COLORS = [
  { name: "Neutral", value: NEUTRAL_ACCENT },
  { name: "Blue", value: "#3b82f6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Green", value: "#22c55e" },
  { name: "Orange", value: "#f97316" },
  { name: "Red", value: "#ef4444" },
  { name: "Pink", value: "#ec4899" },
  { name: "Lilac", value: "#c0a2f1" },
  { name: "Purple", value: "#a855f7" },
  { name: "Indigo", value: "#6366f1" },
] as const;

export const DEFAULT_ACCENT = "#3b82f6";

/** The CSS variables an accent owns. Exported so tests can assert the set. */
export const ACCENT_VARS = [
  "--nuxx-selected-accent",
  "--primary",
  "--primary-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-active",
  "--sidebar-active-foreground",
] as const;

/** Black or white, whichever stays legible on `hex`. */
export function getContrastColor(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex);
  if (!m) return "#ffffff";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#000000" : "#ffffff";
}

/**
 * The Nuxx themes ship with a fixed neutral accent (the theme's own
 * foreground) rather than a user-selectable color, because their whole identity
 * is the branded gradient — a colored primary competes with it. The picker hides
 * the accent control for these two, and the reader's chosen accent is left
 * untouched in storage so it returns when they switch to another theme.
 */
export function isNuxxTheme(themeName: string): boolean {
  return themeName === "nuxx" || themeName === "nuxx-dark";
}

/**
 * Resolve the accent to actually apply for a theme: Nuxx themes are pinned to
 * the neutral accent; every other theme uses the stored one.
 */
export function resolveEffectiveAccent(
  themeName: string,
  accentColor: string,
): string {
  return isNuxxTheme(themeName) ? NEUTRAL_ACCENT : accentColor;
}

/**
 * Build the accent variable map for a color.
 *
 * `NEUTRAL_ACCENT` has no color of its own — it borrows the theme's foreground
 * and background, which are only known once the theme vars are on the root.
 * That is why the neutral branch takes them as arguments rather than reading
 * the document: the caller has just computed them, and reading them back
 * through `getComputedStyle` would depend on the browser having recalculated
 * style in between.
 */
export function accentVars(
  accent: string,
  themeForeground: string,
  themeBackground: string,
): Record<string, string> {
  if (accent === NEUTRAL_ACCENT) {
    return {
      "--nuxx-selected-accent": themeForeground,
      "--primary": themeForeground,
      "--primary-foreground": themeBackground,
      "--sidebar-primary": themeForeground,
      "--sidebar-primary-foreground": themeBackground,
      "--sidebar-active": themeForeground,
      "--sidebar-active-foreground": themeBackground,
    };
  }

  const accentHsl = hexToHsl(accent);
  const fgHsl = hexToHsl(getContrastColor(accent));
  return {
    "--nuxx-selected-accent": accentHsl,
    "--primary": accentHsl,
    "--primary-foreground": fgHsl,
    "--sidebar-primary": accentHsl,
    "--sidebar-primary-foreground": fgHsl,
    "--sidebar-active": accentHsl,
    "--sidebar-active-foreground": fgHsl,
  };
}
