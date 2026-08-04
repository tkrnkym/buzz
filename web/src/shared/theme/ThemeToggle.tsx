import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/shared/theme/ThemeProvider";
import type { ThemeMode } from "@/shared/theme/theme-mode";
import { Button } from "@/shared/ui/button";

const icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const next: Record<ThemeMode, ThemeMode> = {
  light: "dark",
  dark: "system",
  system: "light",
};

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const Icon = icons[mode];

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setMode(next[mode])}
      aria-label={`Theme: ${mode}. Click to switch.`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
