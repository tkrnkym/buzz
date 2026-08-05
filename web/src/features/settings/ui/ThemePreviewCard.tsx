import { type RefObject, useEffect, useRef, useState } from "react";

import {
  memberFor,
  type ThemeFamily,
} from "@/features/settings/theme-families";
import {
  themePreview,
  type ThemePreview,
  WINDOW_CONTROLS,
} from "@/features/settings/theme-preview";
import { cn } from "@/shared/lib/cn";
import { createThemeVars } from "@/shared/theme/adaptive-theme";
import {
  extractThemeInfo,
  loadThemeData,
  type SyntaxThemeName,
} from "@/shared/theme/theme-loader";

/**
 * The palette a card draws with, loaded when the card is first seen.
 *
 * Lazily, because there are 62 themes and each is its own chunk — fetching them all
 * to draw thumbnails would download megabytes to render a grid. The observer fires
 * once and then disconnects; the dynamic imports are module-cached, so scrolling
 * back is free.
 *
 * The returned ref has to reach the element the observer watches: a ref that is
 * created and never attached leaves `ref.current` null, the effect bails on its
 * first line, and every card in the grid sits on its placeholder forever.
 */
function useLazyPreview(name: SyntaxThemeName): {
  preview: ThemePreview | null;
  ref: RefObject<HTMLDivElement | null>;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<ThemePreview | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let cancelled = false;

    const load = () => {
      void loadThemeData(name)
        .then((data) => {
          if (cancelled) return;
          const info = extractThemeInfo(name, data);
          setPreview(
            themePreview(createThemeVars(info.bg, info.fg, info.comment).vars),
          );
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

  return { preview, ref };
}

/** One line of text in the little window. */
function Line({
  color,
  width,
  className,
}: {
  color: string;
  width: string;
  className?: string;
}) {
  return (
    <span
      className={cn("block h-[3px] rounded-full", className)}
      style={{ backgroundColor: color, width }}
    />
  );
}

/** A message: who said it, and two lines of what they said. */
function Row({ preview }: { preview: ThemePreview | null }) {
  return (
    <div className="flex items-start gap-1">
      <span
        className="mt-px block size-2 shrink-0 rounded-full"
        style={{
          backgroundColor: preview?.muted ?? "transparent",
          opacity: 0.6,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px] pt-[3px]">
        <Line color={preview?.text ?? "transparent"} width="40%" />
        <Line color={preview?.muted ?? "transparent"} width="85%" />
      </div>
    </div>
  );
}

/**
 * A theme, as a picture of the app window in it.
 *
 * A name cannot describe a palette — "Gruvbox Hard" tells a reader who has not seen
 * it nothing, and the previous `<select>` made them apply each of 62 themes to find
 * out. So the card draws the window: traffic lights, the sidebar, a couple of
 * messages, and the huddle bar along the bottom, all painted with the theme's own
 * derived variables — the same ones the app would use, so what the card shows is
 * what selecting it does.
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
  const { preview, ref } = useLazyPreview(member);

  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex flex-col gap-2 rounded-xl border-2 p-1.5 transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-transparent hover:bg-accent/40",
      )}
      data-testid={`theme-card-${family.id}`}
      onClick={onSelect}
      type="button"
    >
      <div
        className="flex h-[5.5rem] flex-col overflow-hidden rounded-lg border shadow-sm"
        ref={ref}
        style={{
          borderColor: preview?.border ?? "hsl(var(--border))",
          backgroundColor: preview?.content ?? "hsl(var(--muted))",
        }}
      >
        {/* Title bar. The traffic lights are what make the rest read as a window
            rather than as an abstract two-column swatch. */}
        <div
          className="flex h-4 shrink-0 items-center gap-[3px] px-1.5"
          style={{
            backgroundColor: preview?.chrome ?? "transparent",
            borderBottom: `1px solid ${preview?.border ?? "transparent"}`,
          }}
        >
          {WINDOW_CONTROLS.map((control) => (
            <span
              className="block size-[5px] rounded-full"
              key={control.id}
              style={{ backgroundColor: control.color }}
            />
          ))}
          <span className="ml-auto flex items-center gap-[3px]">
            <Line
              className="h-[5px]"
              color={preview?.muted ?? "transparent"}
              width="8px"
            />
            <Line
              className="h-[5px]"
              color={preview?.muted ?? "transparent"}
              width="8px"
            />
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar: the community rail's width, and one row highlighted the way
              the current channel is. */}
          <div
            className="flex w-[34%] shrink-0 flex-col gap-[5px] p-1.5"
            style={{ backgroundColor: preview?.chrome ?? "transparent" }}
          >
            <Line color={preview?.text ?? "transparent"} width="70%" />
            <Line color={preview?.muted ?? "transparent"} width="90%" />
            <Line color={preview?.muted ?? "transparent"} width="60%" />
            <Line color={preview?.muted ?? "transparent"} width="80%" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[5px] p-1.5">
            <Row preview={preview} />
            <Row preview={preview} />
          </div>
        </div>

        {/* The huddle bar, which stays dark under a light theme. */}
        <div
          className="flex h-3.5 shrink-0 items-center gap-[3px] px-1.5"
          style={{ backgroundColor: preview?.dock ?? "transparent" }}
        >
          <span className="block size-[5px] rounded-full bg-white/70" />
          <span className="block size-[5px] rounded-full bg-white/40" />
          <span className="ml-auto block h-[5px] w-3 rounded-full bg-white/25" />
        </div>
      </div>

      {/* Centred under the card it names, because the card is the subject and the
          label is its caption. */}
      <span className="w-full truncate text-center text-2xs font-medium">
        {family.label}
      </span>
    </button>
  );
}
