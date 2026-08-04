import { useEffect, useRef, useState } from "react";

import {
  memberFor,
  type ThemeFamily,
} from "@/features/settings/theme-families";
import { cn } from "@/shared/lib/cn";
import { createThemeVars } from "@/shared/theme/adaptive-theme";
import {
  extractThemeInfo,
  loadThemeData,
  type SyntaxThemeName,
} from "@/shared/theme/theme-loader";

interface Preview {
  background: string;
  foreground: string;
  sidebar: string;
  muted: string;
  border: string;
}

/**
 * The palette a card draws with, loaded when the card is first seen.
 *
 * Lazily, because there are 62 themes and each is its own chunk — fetching them all
 * to draw thumbnails would download megabytes to render a grid. The observer fires
 * once and then disconnects; the dynamic imports are module-cached, so scrolling
 * back is free.
 */
function useThemePreview(name: SyntaxThemeName): Preview | null {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let cancelled = false;

    const load = () => {
      void loadThemeData(name)
        .then((data) => {
          if (cancelled) return;
          const info = extractThemeInfo(name, data);
          const vars = createThemeVars(info.bg, info.fg, info.comment);
          setPreview({
            background: `hsl(${vars.vars["--background"]})`,
            foreground: `hsl(${vars.vars["--foreground"]})`,
            sidebar: `hsl(${vars.vars["--sidebar-background"]})`,
            muted: `hsl(${vars.vars["--muted-foreground"]})`,
            border: `hsl(${vars.vars["--border"]})`,
          });
        })
        .catch(() => {
          // A theme whose chunk fails to load draws its placeholder rather than
          // an error: the reader can still pick it, and the real load will report.
        });
    };

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    });
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [name]);

  return preview;
}

/** One line of the fake sidebar. */
function Line({ color, width }: { color: string; width: string }) {
  return (
    <span
      className="block h-1 rounded-full"
      style={{ backgroundColor: color, width }}
    />
  );
}

/**
 * A theme, as a picture of the app in it.
 *
 * A name cannot describe a palette — "Gruvbox Hard" tells a reader who has not seen
 * it nothing, and the previous `<select>` made them apply each of 62 themes to find
 * out. The thumbnail is drawn from the theme's own derived variables, the same ones
 * the app would use, so what the card shows is what selecting it does.
 */
export function ThemePreviewCard({
  family,
  onSelect,
  prefersDark,
  selected,
}: {
  family: ThemeFamily;
  onSelect: () => void;
  /** Which half to preview, so the grid matches the mode control above it. */
  prefersDark: boolean;
  selected: boolean;
}) {
  const member = memberFor(family, prefersDark);
  const preview = useThemePreview(member);

  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex flex-col gap-2 rounded-xl border-2 p-2 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-transparent hover:bg-accent/40",
      )}
      data-testid={`theme-card-${family.id}`}
      onClick={onSelect}
      type="button"
    >
      <div
        className="flex h-24 overflow-hidden rounded-lg border"
        style={{
          borderColor: preview?.border ?? "hsl(var(--border))",
          backgroundColor: preview?.background ?? "hsl(var(--muted))",
        }}
      >
        {/* Sidebar, header bar, and body — the three surfaces a reader actually
            looks at, in the proportions the app has them. */}
        <div
          className="flex w-2/5 flex-col gap-1.5 p-2"
          style={{ backgroundColor: preview?.sidebar ?? "transparent" }}
        >
          <Line color={preview?.foreground ?? "transparent"} width="60%" />
          <Line color={preview?.muted ?? "transparent"} width="85%" />
          <Line color={preview?.muted ?? "transparent"} width="70%" />
          <Line color={preview?.muted ?? "transparent"} width="80%" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-2">
          <Line color={preview?.foreground ?? "transparent"} width="45%" />
          <Line color={preview?.muted ?? "transparent"} width="90%" />
          <Line color={preview?.muted ?? "transparent"} width="75%" />
        </div>
      </div>
      <span className="truncate px-1 text-2xs font-medium">{family.label}</span>
    </button>
  );
}
