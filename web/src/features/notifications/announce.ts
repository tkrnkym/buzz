import {
  DEFAULT_SOUND,
  soundRecipe,
  type SoundName,
} from "@/features/notifications/notification-sounds";

/**
 * Raising a notification: the browser popup and the sound.
 *
 * Both are best-effort by nature. `Notification` may not exist, permission may be
 * denied, and an `AudioContext` cannot start before the reader has interacted
 * with the page — so every path here fails quietly and returns whether it did
 * anything, rather than throwing into a render.
 */

/** Whether this browser can show notifications at all. */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Ask for permission.
 *
 * Must be called from a user gesture — browsers ignore (and Chrome warns about) a
 * request made on load, which is why this is wired to a button in Settings rather
 * than to the first arriving mention.
 */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Show a browser notification. Returns false when nothing was shown. */
export function showDesktopNotification({
  body,
  tag,
  title,
}: {
  body: string;
  /** Collapses repeats — a second notification with the same tag replaces it. */
  tag: string;
  title: string;
}): boolean {
  if (!notificationsSupported() || Notification.permission !== "granted") {
    return false;
  }
  try {
    new Notification(title, { body, tag });
    return true;
  } catch {
    // Some browsers refuse a constructed Notification outside a service worker.
    return false;
  }
}

let audioContext: AudioContext | null = null;

/**
 * Play a short two-tone chime.
 *
 * Synthesized rather than shipped as a file: it is two oscillators and a gain
 * ramp, which costs nothing in the bundle and cannot 404. The envelope matters —
 * a bare oscillator start/stop clicks audibly at both ends.
 */
export function playNotificationSound(
  sound: SoundName = DEFAULT_SOUND,
): boolean {
  const { tones, gap } = soundRecipe(sound);
  // Silence is a choice, so it succeeds: the caller asked for no sound and got it.
  if (tones.length === 0) return true;
  try {
    audioContext ??= new AudioContext();
    const context = audioContext;
    // Suspended until the reader has interacted with the page; resuming is a
    // no-op when it is already running.
    void context.resume();
    const now = context.currentTime;
    for (const [index, frequency] of tones.entries()) {
      const start = now + index * gap;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    }
    return true;
  } catch {
    return false;
  }
}
