import {
  isLightTheme,
  SYNTAX_THEMES,
  THEME_PAIRS,
  type SyntaxThemeName,
} from "@/shared/theme/theme-loader";

/**
 * The 62 themes, as the families a reader picks from.
 *
 * The picker was a `<select>` of all 62, which asks the reader to choose a *file*
 * — "github-light-high-contrast" — when what they are choosing is a look. Worse,
 * light and dark were separate entries, so the mode control and the theme control
 * fought: picking Dark after choosing `github-light` had to silently jump to a
 * different row of the same list.
 *
 * A family is one look with up to two halves. The reader picks the family, the
 * mode picks the half, and the two controls stop overlapping.
 */

export interface ThemeFamily {
  /** Stable id: the light half when there is one, else the only member. */
  id: SyntaxThemeName;
  label: string;
  light: SyntaxThemeName | null;
  dark: SyntaxThemeName | null;
}

/** Words that describe a half rather than the family. */
const HALF_WORDS = new Set(["light", "dark", "lighter", "darker"]);

/**
 * A readable family name: `github-light-high-contrast` → `Github High Contrast`.
 *
 * The half-words are dropped rather than the suffix trimmed, because they are not
 * always last — `github-light-default` and `gruvbox-light-hard` both carry the
 * distinguishing word *after* the half.
 */
export function familyLabel(name: SyntaxThemeName): string {
  // The theme files are still named for the relay; the picker is read by someone
  // using the app, and the app is Buzz — the same name the rest of this surface
  // uses ("Buzz のテーマを選びます").
  if (name === "nuxx" || name === "nuxx-dark") return "Buzz";
  const words = name
    .split("-")
    .filter((word) => !HALF_WORDS.has(word))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  // Every word was a half-word (there is no such theme today, but a future
  // `light`/`dark` pair would land here): fall back to the id rather than "".
  return words.length > 0 ? words.join(" ") : name;
}

/**
 * Families in a stable order.
 *
 * Paired families come first, in `THEME_PAIRS` order — which puts the first-party
 * pair first — then the unpaired ones alphabetically. A single-half family sorted
 * in among the pairs would look like a pair whose other half failed to load.
 */
export function themeFamilies(): ThemeFamily[] {
  const families: ThemeFamily[] = [];
  const claimed = new Set<SyntaxThemeName>();

  for (const [name, pair] of THEME_PAIRS) {
    if (claimed.has(name)) continue;
    const light = isLightTheme(name) ? name : pair;
    const dark = isLightTheme(name) ? pair : name;
    claimed.add(light);
    claimed.add(dark);
    families.push({ id: light, label: familyLabel(light), light, dark });
  }

  const singles = SYNTAX_THEMES.filter((name) => !claimed.has(name))
    .map((name) => ({
      id: name,
      label: familyLabel(name),
      light: isLightTheme(name) ? name : null,
      dark: isLightTheme(name) ? null : name,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return [...families, ...singles];
}

/** The family a theme belongs to, or `null` if the name is not a theme. */
export function familyOf(name: SyntaxThemeName): ThemeFamily | null {
  return (
    themeFamilies().find(
      (family) => family.light === name || family.dark === name,
    ) ?? null
  );
}

/**
 * The half to apply when a family is picked.
 *
 * Falls back to whichever half exists, so choosing a light-only family while in
 * Dark applies it rather than doing nothing — the reader asked for that look, and
 * refusing silently is worse than showing it in the only shade it has.
 */
export function memberFor(
  family: ThemeFamily,
  prefersDark: boolean,
): SyntaxThemeName {
  const wanted = prefersDark ? family.dark : family.light;
  return wanted ?? family.dark ?? family.light ?? family.id;
}
