/**
 * Notification preferences, kept in this browser.
 *
 * Not published to the relay, and that is a decision rather than an omission.
 * "Play a sound" and "show a desktop notification" are properties of the machine
 * a reader is sitting at — a laptop in an office and a phone on a train want
 * different answers, and a synced setting would force one on both. The desktop
 * client stored these locally for the same reason.
 *
 * Keyed by pubkey so two identities in one browser do not share them.
 */

import {
  DEFAULT_SOUND,
  isSoundName,
  type SoundName,
} from "@/features/notifications/notification-sounds";
import type { NotificationCategory } from "@/features/notifications/notifications-model";

export interface NotificationPrefs {
  /** Categories that may raise a desktop notification or a sound. */
  categories: Record<NotificationCategory, boolean>;
  /**
   * Which tone each category plays.
   *
   * Per category rather than one for all of them, because the point of a sound is
   * to say *what* arrived without looking — a DM and a thread reply that sound
   * identical carry no more information than a single beep.
   */
  sounds: Record<NotificationCategory, SoundName>;
  /** Show a browser notification. Requires permission, which is separate. */
  desktop: boolean;
  sound: boolean;
  /**
   * Only notify when the tab is in the background.
   *
   * On by default: a notification for a message that is already on screen is
   * noise, and the reader is looking straight at it.
   */
  onlyWhenHidden: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  categories: { mention: true, dm: true, reply: true },
  sounds: { mention: DEFAULT_SOUND, dm: DEFAULT_SOUND, reply: DEFAULT_SOUND },
  desktop: false,
  sound: false,
  onlyWhenHidden: true,
};

const VERSION = "v1";

export function prefsStorageKey(pubkey: string | null): string {
  return `nuxx-notification-prefs.${VERSION}:${pubkey ?? "anonymous"}`;
}

/**
 * Read the stored preferences, merged over the defaults.
 *
 * Field-by-field rather than a whole-object replace, so a stored blob written by
 * an older version — missing a category that has since been added — comes back
 * with that category enabled rather than `undefined`.
 */
export function readPrefs(pubkey: string | null): NotificationPrefs {
  try {
    const raw = localStorage.getItem(prefsStorageKey(pubkey));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      categories: { ...DEFAULT_PREFS.categories, ...parsed.categories },
      // Each value validated, not merged blindly: a stored sound name that no
      // longer exists would otherwise reach the oscillator and play nothing, which
      // reads as the toggle being broken rather than the name being stale.
      sounds: {
        mention: isSoundName(parsed.sounds?.mention)
          ? parsed.sounds.mention
          : DEFAULT_SOUND,
        dm: isSoundName(parsed.sounds?.dm) ? parsed.sounds.dm : DEFAULT_SOUND,
        reply: isSoundName(parsed.sounds?.reply)
          ? parsed.sounds.reply
          : DEFAULT_SOUND,
      },
      desktop: parsed.desktop ?? DEFAULT_PREFS.desktop,
      sound: parsed.sound ?? DEFAULT_PREFS.sound,
      onlyWhenHidden: parsed.onlyWhenHidden ?? DEFAULT_PREFS.onlyWhenHidden,
    };
  } catch {
    // A corrupt or unavailable store (private mode, quota) is not worth failing
    // a render over — the defaults are quiet, which is the safe direction.
    return DEFAULT_PREFS;
  }
}

export function writePrefs(
  pubkey: string | null,
  prefs: NotificationPrefs,
): void {
  try {
    localStorage.setItem(prefsStorageKey(pubkey), JSON.stringify(prefs));
  } catch {
    // Ignored for the same reason as above.
  }
}

/**
 * Whether a notification of this category should be raised at all.
 *
 * Split out from the effect that raises it so the rule is testable without a
 * `Notification` constructor or a document to hide.
 */
export function shouldAnnounce({
  category,
  documentHidden,
  prefs,
}: {
  category: NotificationCategory;
  documentHidden: boolean;
  prefs: NotificationPrefs;
}): boolean {
  if (!prefs.categories[category]) return false;
  if (prefs.onlyWhenHidden && !documentHidden) return false;
  return prefs.desktop || prefs.sound;
}
