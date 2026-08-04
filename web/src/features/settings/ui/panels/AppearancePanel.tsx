import { Monitor, Moon, Sun } from "lucide-react";
import { useMemo } from "react";

import {
  familyOf,
  memberFor,
  themeFamilies,
} from "@/features/settings/theme-families";
import { SettingCard, SettingRow } from "@/features/settings/ui/SettingRow";
import { ThemePreviewCard } from "@/features/settings/ui/ThemePreviewCard";
import { cn } from "@/shared/lib/cn";
import { useTheme } from "@/shared/theme/ThemeProvider";
import { ACCENT_COLORS, NEUTRAL_ACCENT } from "@/shared/theme/accent";
import type { ThemeMode } from "@/shared/theme/theme-mode";
import { useThreadLayout } from "@/features/settings/use-thread-layout";
import {
  THREAD_LAYOUTS,
  type ThreadLayout,
} from "@/features/settings/thread-layout";
import { ValuePicker } from "@/shared/ui/field-row";

const MODES: ReadonlyArray<{
  value: ThemeMode;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/**
 * Appearance: the mode, the look, the accent, and where threads open.
 *
 * The mode and the look are one decision split in two, not two independent ones.
 * A look has up to two halves and the mode picks which — so the grid shows families
 * and switching to Dark moves inside the chosen family rather than jumping to a
 * different row of a flat list of 62. See `theme-families.ts`.
 */
export function AppearancePanel() {
  const {
    accentColor,
    accentPinned,
    isDark,
    isLoading,
    mode,
    selectedTheme,
    setAccentColor,
    setMode,
    setThemeName,
  } = useTheme();
  const threadLayout = useThreadLayout();

  const families = useMemo(() => themeFamilies(), []);
  const current = familyOf(selectedTheme);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2" data-testid="theme-picker">
        {MODES.map(({ value, label, Icon }) => (
          <button
            aria-pressed={mode === value}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
              mode === value
                ? "border-primary text-foreground"
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

      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
          isLoading && "opacity-60",
        )}
        data-testid="theme-grid"
      >
        {families.map((family) => (
          <ThemePreviewCard
            family={family}
            key={family.id}
            // Previewed in the half the reader is currently in, so the grid and
            // the window agree about what "this theme" looks like right now.
            onSelect={() => setThemeName(memberFor(family, isDark))}
            prefersDark={isDark}
            selected={current?.id === family.id}
          />
        ))}
      </div>

      {/* Nuxx pins the accent to its own foreground, so offering the swatches
          there would be a control that does nothing. */}
      {!accentPinned && (
        <div className="flex flex-col gap-2">
          <p className="text-base font-semibold">Accent color</p>
          <div className="flex flex-wrap gap-2.5" data-testid="accent-picker">
            {ACCENT_COLORS.map(({ name, value }) => (
              <button
                aria-label={name}
                aria-pressed={accentColor === value}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-background transition-all",
                  accentColor === value
                    ? "ring-foreground"
                    : "ring-transparent",
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
              >
                {accentColor === value && (
                  <span className="size-2.5 rounded-full bg-white/90" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <SettingCard>
        <SettingRow
          description={
            threadLayout.layout === "split"
              ? "スレッドはチャンネルの横のパネルで開きます"
              : "スレッドはチャンネルの中に展開します"
          }
          testId="thread-layout-row"
          title="Thread layout"
        >
          <ValuePicker<ThreadLayout>
            ariaLabel="Thread layout"
            onChange={threadLayout.setLayout}
            options={THREAD_LAYOUTS}
            testId="thread-layout"
            value={threadLayout.layout}
          />
        </SettingRow>
      </SettingCard>
    </div>
  );
}
