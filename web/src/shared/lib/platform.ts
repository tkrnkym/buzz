type ModifierKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
>;

/** True on macOS/iOS-style Apple platforms. */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /mac|iphone|ipad|ipod/i.test(navigator.platform);
}

/**
 * The platform's normal application-shortcut modifier: Command on macOS,
 * Control elsewhere.
 *
 * On macOS this deliberately rejects Control so the native Emacs-style text
 * bindings (Ctrl-A/E/B/F/K) stay available inside text fields.
 */
export function hasPrimaryShortcutModifier(
  event: ModifierKeyboardEvent,
): boolean {
  if (isMacPlatform()) {
    return event.metaKey && !event.ctrlKey;
  }
  return event.ctrlKey && !event.metaKey;
}
