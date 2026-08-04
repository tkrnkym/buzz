import { Monitor, Moon, Sun } from "lucide-react";

import { Section } from "@/features/settings/ui/Section";
import { cn } from "@/shared/lib/cn";
import { useTheme } from "@/shared/theme/ThemeProvider";
import { ACCENT_COLORS, NEUTRAL_ACCENT } from "@/shared/theme/accent";
import {
  SYNTAX_THEMES,
  type SyntaxThemeName,
  isLightTheme,
} from "@/shared/theme/theme-loader";
import type { ThemeMode } from "@/shared/theme/theme-mode";

const MODES: ReadonlyArray<{
  value: ThemeMode;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/** A readable name for a theme id: `vitesse-dark` → `Vitesse Dark`. */
function themeLabel(name: SyntaxThemeName): string {
  if (name === "nuxx") return "Nuxx";
  if (name === "nuxx-dark") return "Nuxx Dark";
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const LIGHT_OPTIONS = SYNTAX_THEMES.filter((name) => isLightTheme(name));
const DARK_OPTIONS = SYNTAX_THEMES.filter((name) => !isLightTheme(name));

/**
 * Appearance: the mode, the palette, and the one color that is chosen.
 *
 * The three controls are not independent. The palette comes from a named theme
 * and each theme is either light or dark, so Light/Dark moves within the chosen
 * theme's pair rather than overriding it — and a theme with no counterpart says
 * so instead of silently ignoring the mode.
 */
export function AppearanceSettings() {
  const {
    accentColor,
    accentPinned,
    hasPair,
    isLoading,
    mode,
    selectedTheme,
    setAccentColor,
    setMode,
    setThemeName,
  } = useTheme();

  return (
    <Section
      description="The palette comes from the selected theme; Light and Dark move between its two halves."
      title="Appearance"
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2" data-testid="theme-picker">
          {MODES.map(({ value, label, Icon }) => (
            <button
              aria-pressed={mode === value}
              className={cn(
                "flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-2xs font-medium transition-colors",
                mode === value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              data-testid={`theme-${value}`}
              key={value}
              onClick={() => setMode(value)}
              type="button"
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium text-muted-foreground">
            Theme
          </span>
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid="theme-name"
            disabled={isLoading}
            onChange={(event) =>
              setThemeName(event.target.value as SyntaxThemeName)
            }
            value={selectedTheme}
          >
            <optgroup label="Light">
              {LIGHT_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  {themeLabel(name)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Dark">
              {DARK_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  {themeLabel(name)}
                </option>
              ))}
            </optgroup>
          </select>
          {!hasPair && (
            <span className="text-2xs text-muted-foreground">
              {themeLabel(selectedTheme)} has no light or dark counterpart, so
              Light and Dark leave it as it is.
            </span>
          )}
        </label>

        {/* Nuxx pins the accent to its own foreground, so offering the swatches
            there would be a control that does nothing. */}
        {!accentPinned && (
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs font-medium text-muted-foreground">
              Accent
            </span>
            <div className="flex flex-wrap gap-2" data-testid="accent-picker">
              {ACCENT_COLORS.map(({ name, value }) => (
                <button
                  aria-label={name}
                  aria-pressed={accentColor === value}
                  className={cn(
                    "size-7 rounded-full border-2 transition-colors",
                    accentColor === value
                      ? "border-foreground"
                      : "border-transparent hover:border-border",
                  )}
                  data-testid={`accent-${value.replace("#", "")}`}
                  key={value}
                  onClick={() => setAccentColor(value)}
                  style={
                    value === NEUTRAL_ACCENT
                      ? { backgroundColor: "hsl(var(--foreground))" }
                      : { backgroundColor: value }
                  }
                  title={name}
                  type="button"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
