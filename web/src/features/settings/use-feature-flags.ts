import { useCallback, useEffect, useState } from "react";

import {
  FEATURE_FLAGS_KEY,
  readFlags,
  type FeatureFlag,
  type FeatureFlagState,
} from "@/features/settings/feature-flags";

export {
  FEATURE_FLAGS,
  type FeatureFlag,
  type FeatureFlagState,
} from "@/features/settings/feature-flags";

/** Everyone reading the flags in this tab, so a change lands everywhere at once. */
const listeners = new Set<(flags: FeatureFlagState) => void>();

/**
 * The experiment flags, and how to change them.
 *
 * A tiny store rather than context for the same reason `use-thread-layout` is one:
 * the writer is the Settings window and the readers are the sidebar and the routes,
 * which are never mounted together with it.
 */
export function useFeatureFlags(): {
  flags: FeatureFlagState;
  setFlag: (flag: FeatureFlag, on: boolean) => void;
} {
  const [flags, setLocal] = useState<FeatureFlagState>(() =>
    readFlags(
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(FEATURE_FLAGS_KEY),
    ),
  );

  useEffect(() => {
    listeners.add(setLocal);
    const onStorage = (event: StorageEvent) => {
      if (event.key === FEATURE_FLAGS_KEY) setLocal(readFlags(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(setLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setFlag = useCallback((flag: FeatureFlag, on: boolean) => {
    const next = readFlags(localStorage.getItem(FEATURE_FLAGS_KEY));
    next[flag] = on;
    localStorage.setItem(FEATURE_FLAGS_KEY, JSON.stringify(next));
    for (const listener of listeners) listener(next);
  }, []);

  return { flags, setFlag };
}
