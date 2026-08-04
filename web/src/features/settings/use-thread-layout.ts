import { useCallback, useEffect, useState } from "react";

import {
  readThreadLayout,
  THREAD_LAYOUT_KEY,
  type ThreadLayout,
} from "@/features/settings/thread-layout";

export {
  THREAD_LAYOUTS,
  showsTimelineBesideThread,
  type ThreadLayout,
} from "@/features/settings/thread-layout";

/** Everyone reading the value in this tab, so a change lands everywhere at once. */
const listeners = new Set<(layout: ThreadLayout) => void>();

/**
 * Where threads open, and how to change it.
 *
 * A tiny store rather than context, because the two readers are on opposite sides
 * of the app — the Appearance screen writes it and the chat pane reads it — and
 * they are never mounted together. A provider high enough to cover both would have
 * to be the root, for one string.
 *
 * `storage` is watched as well, so changing it in one tab moves the other: the
 * setting is about this browser, and two tabs of the same browser disagreeing about
 * it is the state that reads as a bug.
 */
export function useThreadLayout(): {
  layout: ThreadLayout;
  setLayout: (layout: ThreadLayout) => void;
} {
  const [layout, setLocal] = useState<ThreadLayout>(() =>
    readThreadLayout(
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(THREAD_LAYOUT_KEY),
    ),
  );

  useEffect(() => {
    listeners.add(setLocal);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THREAD_LAYOUT_KEY)
        setLocal(readThreadLayout(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(setLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setLayout = useCallback((next: ThreadLayout) => {
    localStorage.setItem(THREAD_LAYOUT_KEY, next);
    for (const listener of listeners) listener(next);
  }, []);

  return { layout, setLayout };
}
