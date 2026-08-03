import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { SHOWCASE, type Showcase } from "@/mock/showcase";

/**
 * Mutable fixtures for the mock-up screens.
 *
 * The fixtures used to be a module constant, which meant the create and delete
 * controls on those screens had nowhere to write — so they were disabled, and a
 * demo of a product where you cannot make anything is a demo of a list widget.
 * This holds the same data as React state and hands out a mutator.
 *
 * Session-scoped on purpose. Nothing is persisted and nothing is published: a
 * reload starts from the seeded fixtures again. That is the honest shape for a
 * screen with no relay path — pretending otherwise by writing to `localStorage`
 * would produce a demo that slowly fills with a stranger's leftovers.
 *
 * `null` outside the demo build, exactly as before. Someone pointing this client
 * at a real relay must not be shown invented projects as if they were theirs.
 */
interface ShowcaseStore {
  showcase: Showcase | null;
  /** Apply a change. Ignored when there are no fixtures to change. */
  update: (change: (current: Showcase) => Showcase) => void;
}

const ShowcaseContext = createContext<ShowcaseStore | null>(null);

export function ShowcaseStoreProvider({ children }: { children: ReactNode }) {
  // Seeded once. A deep copy is unnecessary — every mutator below returns new
  // objects rather than mutating, which is also what keeps React re-rendering.
  const [showcase, setShowcase] = useState<Showcase | null>(() =>
    isShowcaseEnabled() ? SHOWCASE : null,
  );

  const update = useCallback((change: (current: Showcase) => Showcase) => {
    setShowcase((current) => (current === null ? null : change(current)));
  }, []);

  const value = useMemo(() => ({ showcase, update }), [showcase, update]);

  return (
    <ShowcaseContext.Provider value={value}>
      {children}
    </ShowcaseContext.Provider>
  );
}

/**
 * Fixtures for the mock-up screens, or `null` when there are none.
 *
 * Falls back to the seeded constant when no provider is mounted, so a screen
 * rendered outside the shell — or in a test — behaves as it did before the store
 * existed rather than losing its data.
 */
export function useShowcase(): Showcase | null {
  const store = useContext(ShowcaseContext);
  if (store) return store.showcase;
  return isShowcaseEnabled() ? SHOWCASE : null;
}

/**
 * The mutator, or `null` when there is nothing to mutate.
 *
 * Returning `null` rather than a no-op function is deliberate: a screen has to
 * decide what to render when it cannot save, and a silent no-op would let it
 * offer a Create button that does nothing.
 */
export function useShowcaseUpdate():
  | ((change: (current: Showcase) => Showcase) => void)
  | null {
  const store = useContext(ShowcaseContext);
  if (!store || store.showcase === null) return null;
  return store.update;
}

/** Whether the mock-up screens have data behind them. */
export function isShowcaseEnabled(): boolean {
  return import.meta.env.VITE_MOCK_RELAY === "1";
}

/**
 * An id for something created in the demo.
 *
 * Prefixed so a fixture and a session-created row are never confused when
 * reading a test failure, and counter-based rather than time-based so two things
 * created in the same millisecond do not collide.
 */
let created = 0;

export function nextMockId(prefix: string): string {
  created += 1;
  return `${prefix}-new-${created}`;
}
