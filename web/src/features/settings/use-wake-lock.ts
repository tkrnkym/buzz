import { useEffect, useState } from "react";

/**
 * Keeping the machine awake while agents are running.
 *
 * A real capability here, not a mock: `navigator.wakeLock` is a screen wake lock,
 * which is what a browser has. It is not the system sleep inhibitor a desktop app
 * would take, and the difference is worth stating on the screen rather than
 * implying — a laptop with the lid closed sleeps either way.
 *
 * The lock is released by the browser whenever the tab is hidden, so it has to be
 * re-taken on `visibilitychange`. Without that, switching tabs once loses it for
 * good and the setting silently stops working.
 */

export const WAKE_LOCK_KEY = "nuxx-keep-awake.v1";

export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

export function useKeepAwake(): {
  enabled: boolean;
  supported: boolean;
  setEnabled: (on: boolean) => void;
} {
  const [enabled, setLocal] = useState(() => {
    try {
      return localStorage.getItem(WAKE_LOCK_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!enabled || !wakeLockSupported()) return;
    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const take = async () => {
      if (released || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Denied, or the tab lost focus mid-request. Not worth an error: the
        // screen already says this is best-effort.
      }
    };

    void take();
    const onVisible = () => void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [enabled]);

  const setEnabled = (on: boolean) => {
    setLocal(on);
    try {
      localStorage.setItem(WAKE_LOCK_KEY, on ? "1" : "0");
    } catch {
      // Private mode. Losing the preference is not worth failing over.
    }
  };

  return { enabled, supported: wakeLockSupported(), setEnabled };
}
