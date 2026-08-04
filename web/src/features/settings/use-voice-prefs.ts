import { useCallback, useEffect, useState } from "react";

/**
 * Reading agent messages aloud, and which voice does it.
 *
 * Per-browser like the other device settings: the available voices come from the
 * operating system, so the chosen one is not even meaningful on another machine.
 */

export interface VoicePrefs {
  enabled: boolean;
  /** A `SpeechSynthesisVoice.name`, or "" for the browser's default. */
  voice: string;
}

export const VOICE_PREFS_KEY = "nuxx-voice-prefs.v1";

const DEFAULTS: VoicePrefs = { enabled: false, voice: "" };

function read(): VoicePrefs {
  try {
    const raw = localStorage.getItem(VOICE_PREFS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>;
    return {
      enabled: parsed.enabled ?? DEFAULTS.enabled,
      voice: typeof parsed.voice === "string" ? parsed.voice : DEFAULTS.voice,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useVoicePrefs(): {
  prefs: VoicePrefs;
  setPrefs: (prefs: VoicePrefs) => void;
} {
  const [prefs, setLocal] = useState<VoicePrefs>(read);

  const setPrefs = useCallback((next: VoicePrefs) => {
    setLocal(next);
    try {
      localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(next));
    } catch {
      // Private mode or a full quota. Losing a preference is not worth an error.
    }
  }, []);

  return { prefs, setPrefs };
}

/**
 * The voices this machine has.
 *
 * Read on every call rather than cached: Chrome populates the list asynchronously
 * and returns an empty array on the first call after load, so a cached empty list
 * would show "no voices available" on a machine that has thirty.
 */
export function systemVoices(): string[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return [];
  return window.speechSynthesis
    .getVoices()
    .map((voice) => voice.name)
    .sort((left, right) => left.localeCompare(right));
}

/** Re-render when the voice list arrives, since the first read is usually empty. */
export function useVoiceListReady(): void {
  const [, bump] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const onChange = () => bump((count) => count + 1);
    window.speechSynthesis.addEventListener("voiceschanged", onChange);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", onChange);
  }, []);
}

/** Say one line, so the reader can hear the voice before choosing it. */
export function speakSample(voiceName: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }
  try {
    const utterance = new SpeechSynthesisUtterance(
      "レビューを終えました。気になったのは三点です。",
    );
    const match = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.name === voiceName);
    if (match) utterance.voice = match;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
