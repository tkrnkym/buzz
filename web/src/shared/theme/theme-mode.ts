/**
 * The reader-facing light/dark/system control, expressed over the theme model.
 *
 * The palette is chosen by naming a theme (`vitesse-dark`, `nuxx`, …), and each
 * theme is either light or dark — there is no light/dark switch underneath it.
 * But the app has always offered a three-way Light / Dark / Follow-system
 * toggle, and that is the control most readers reach for. This module is the
 * mapping between the two, kept pure so the awkward cases are pinned by tests
 * rather than discovered in a browser.
 */

import {
  type SyntaxThemeName,
  NUXX_DARK_THEME_NAME,
  NUXX_THEME_NAME,
  getThemePair,
  isLightTheme,
  isValidThemeName,
} from "./theme-loader";

export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "nuxx-theme";
export const ACCENT_STORAGE_KEY = "nuxx-accent-color";
export const FOLLOW_SYSTEM_KEY = "nuxx-follow-system";
export const THEME_CACHE_KEY = "nuxx-theme-cache";

/**
 * Resolve the stored theme, migrating the three legacy values.
 *
 * Before the palette came from a theme, this key held `light` / `dark` /
 * `system`. Those readers get the Nuxx pair, which is the closest thing to what
 * they had: the branded theme in the mode they picked. An unrecognised value
 * falls back rather than throwing — a corrupt preference should not stop the app
 * from painting.
 */
export function readStoredTheme(
  stored: string | null,
  fallback: SyntaxThemeName,
): SyntaxThemeName {
  if (!stored) return fallback;
  if (stored === "light" || stored === "system") return NUXX_THEME_NAME;
  if (stored === "dark") return NUXX_DARK_THEME_NAME;
  return isValidThemeName(stored) ? stored : fallback;
}

/**
 * Resolve whether to follow the OS color scheme.
 *
 * Three cases, in order: an explicit stored choice wins; a reader whose only
 * stored value is the legacy `system` gets follow-mode, because that is what
 * they asked for; and a fresh profile follows the OS, so a first run in dark
 * mode does not open blinding.
 */
export function readStoredFollowSystem(
  storedFollow: string | null,
  storedTheme: string | null,
): boolean {
  if (storedFollow !== null) return storedFollow === "true";
  if (storedTheme === "system") return true;
  return storedTheme === null;
}

/** The mode to show in the toggle for a given state. */
export function modeFor(followSystem: boolean, isDark: boolean): ThemeMode {
  if (followSystem) return "system";
  return isDark ? "dark" : "light";
}

/**
 * Apply a mode choice to the theme model.
 *
 * Picking Light or Dark keeps the reader's theme family and moves to its
 * counterpart — someone on `vitesse-dark` who picks Light gets `vitesse-light`,
 * not thrown back to the default. A theme with no counterpart (`monokai`,
 * `houston`) stays put: switching them to an unrelated theme to satisfy the
 * toggle would lose the choice the reader actually made, so the mode request is
 * dropped instead and the toggle reports the theme's real darkness.
 */
export function applyMode(
  selected: SyntaxThemeName,
  mode: ThemeMode,
): { theme: SyntaxThemeName; followSystem: boolean } {
  if (mode === "system") return { theme: selected, followSystem: true };

  const wantLight = mode === "light";
  if (isLightTheme(selected) === wantLight) {
    return { theme: selected, followSystem: false };
  }

  const pair = getThemePair(selected);
  return { theme: pair ?? selected, followSystem: false };
}

/**
 * The theme a dev-only `?previewTheme=` parameter asks for.
 *
 * Accepts a theme name so a screenshot spec can pin an exact palette, and still
 * accepts `light` / `dark` because that is what the parameter meant before
 * themes existed. Returns null for anything else, including a theme name that
 * is not bundled.
 */
export function previewThemeFrom(search: string): SyntaxThemeName | null {
  const requested = new URLSearchParams(search).get("previewTheme");
  if (!requested) return null;
  if (requested === "light") return NUXX_THEME_NAME;
  if (requested === "dark") return NUXX_DARK_THEME_NAME;
  return isValidThemeName(requested) ? requested : null;
}
