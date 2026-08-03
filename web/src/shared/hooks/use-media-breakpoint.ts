import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Returns `true` while the viewport is narrower than `breakpointPx`.
 *
 * `matchMedia` rather than a resize listener: the browser evaluates the query
 * itself and only notifies on a crossing, so a drag-resize does not fire a
 * render per pixel.
 */
export function useMediaBreakpoint(breakpointPx: number): boolean {
  const [isBelow, setIsBelow] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpointPx : false,
  );

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const onChange = () => setIsBelow(window.innerWidth < breakpointPx);
    query.addEventListener("change", onChange);
    // Re-read on subscribe: the viewport can have changed between render and
    // effect (an orientation flip, a devtools dock).
    onChange();
    return () => query.removeEventListener("change", onChange);
  }, [breakpointPx]);

  return isBelow;
}

/** The sidebar's off-canvas threshold, shared by every layout that follows it. */
export function useIsMobile(): boolean {
  return useMediaBreakpoint(MOBILE_BREAKPOINT);
}
