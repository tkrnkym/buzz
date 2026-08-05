/**
 * The colours a theme thumbnail draws with.
 *
 * `createThemeVars` returns forty-odd variables as bare HSL components ("210 6% 12%"),
 * because that is the shape Tailwind's `hsl(var(--x))` wrappers want. A thumbnail is
 * inline styles, so it needs whole colours — and it needs a named handful of them
 * rather than the whole map, so that what each region of the little window is painted
 * with is stated once here instead of guessed at the call site.
 *
 * The regions are the app's own surfaces: the title bar and the sidebar share the
 * chrome colour, the content pane is the background, and the band along the bottom is
 * the huddle control bar — which is the one part of the window that stays dark under a
 * light theme, and is the reason a thumbnail is recognisable as this app rather than
 * as any two-column layout.
 */

export interface ThemePreview {
  /** Title bar and sidebar — the chrome around the content. */
  chrome: string;
  /** The content pane. */
  content: string;
  /** The huddle bar along the bottom. */
  dock: string;
  /** Text lines with weight: names, the active row. */
  text: string;
  /** Text lines without: message bodies, inactive rows. */
  muted: string;
  border: string;
}

/** Wrap the bare HSL components a theme variable carries into a colour. */
function color(vars: Record<string, string>, name: string): string {
  return `hsl(${vars[name]})`;
}

/**
 * Pick the thumbnail's colours out of a derived variable map.
 *
 * Takes the map rather than the theme name so it stays pure — the caller does the
 * loading, which is where the laziness has to live anyway.
 */
export function themePreview(vars: Record<string, string>): ThemePreview {
  return {
    chrome: color(vars, "--sidebar-background"),
    content: color(vars, "--background"),
    dock: color(vars, "--huddle-control-surface"),
    text: color(vars, "--foreground"),
    muted: color(vars, "--muted-foreground"),
    border: color(vars, "--border"),
  };
}

/**
 * The window controls, which belong to the OS rather than to the theme.
 *
 * They are the same three colours in every theme, which is exactly why they read as
 * a window: a thumbnail that tinted them would lose the one cue that says the picture
 * is of an application and not of a swatch.
 */
export const WINDOW_CONTROLS: ReadonlyArray<{ id: string; color: string }> = [
  { id: "close", color: "#ff5f57" },
  { id: "minimize", color: "#febc2e" },
  { id: "zoom", color: "#28c840" },
];
