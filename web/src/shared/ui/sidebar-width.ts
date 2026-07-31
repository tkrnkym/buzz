/**
 * Sidebar resize arithmetic, kept pure so the detent behaviour is testable
 * without a pointer or a DOM.
 *
 * The default width is a detent, not just an initial value: dragging near it
 * snaps, and dragging away from it eases out. Without that the sidebar is
 * almost impossible to put back exactly where it started.
 */

export const SIDEBAR_WIDTH_DEFAULT = 300;
export const SIDEBAR_WIDTH_MIN = 220;
export const SIDEBAR_WIDTH_MAX = 420;
export const SIDEBAR_WIDTH_MOBILE = "288px";
export const SIDEBAR_WIDTH_ICON = "48px";

/** Inside this distance the width snaps to the default outright. */
const SNAP_DISTANCE = 8;
/** Beyond this distance the detent has no influence at all. */
const MAGNET_DISTANCE = 28;

export function clampSidebarWidth(width: number): number {
  return Math.min(
    SIDEBAR_WIDTH_MAX,
    Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)),
  );
}

/** Pull a dragged width toward the default, easing out of the detent. */
export function magnetizeSidebarWidth(width: number): number {
  const offset = width - SIDEBAR_WIDTH_DEFAULT;
  const distance = Math.abs(offset);

  if (distance <= SNAP_DISTANCE) {
    return SIDEBAR_WIDTH_DEFAULT;
  }
  if (distance >= MAGNET_DISTANCE) {
    return clampSidebarWidth(width);
  }

  // Ease out of the detent so the default feels sticky without blocking resize.
  const progress =
    (distance - SNAP_DISTANCE) / (MAGNET_DISTANCE - SNAP_DISTANCE);
  const easedDistance = MAGNET_DISTANCE * progress * progress;

  return clampSidebarWidth(
    SIDEBAR_WIDTH_DEFAULT + Math.sign(offset) * easedDistance,
  );
}
