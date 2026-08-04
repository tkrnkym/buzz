import type { ReactNode } from "react";

/**
 * The two surfaces the Nuxx theme is built out of.
 *
 * The shell is a gradient canvas with a rounded content card floating on it.
 * That shape is what the chrome/content split in `adaptive-theme.ts` is for, and
 * both halves need a DOM hook the stylesheet can find — the tokens alone paint
 * nothing. Ported from the desktop client's `BuzzThemeSurfaces.tsx` (commit
 * 02749b3^).
 */

/**
 * The gradient, painted once behind the whole shell.
 *
 * Both layers are always present and only their opacity is switched (see
 * `globals.css`), because replacing a `background-image` on a live surface can
 * leave a stale raster behind when the app changes appearance without a reload.
 * Under any non-Nuxx theme neither layer is given opacity, so this renders
 * nothing at all.
 */
export function GradientLayer() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
      data-nuxx-gradient-layer
    >
      <div
        className="nuxx-theme-gradient-layer-light absolute inset-0 opacity-0"
        data-nuxx-gradient="light"
      />
      <div
        className="nuxx-theme-gradient-layer-dark absolute inset-0 opacity-0"
        data-nuxx-gradient="dark"
      />
    </div>
  );
}

/**
 * The content card: everything that is not chrome.
 *
 * `data-nuxx-content-surface` is the hook that lets Nuxx Dark override
 * `--background` locally to its much darker inset neutral, so every descendant
 * pane using `bg-background` follows without being told.
 */
export function ContentSurface({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative z-10 mb-2 ml-px mr-2 mt-px flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background shadow-content-edge"
      data-nuxx-content-surface
    >
      {children}
    </div>
  );
}
