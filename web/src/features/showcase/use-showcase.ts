/**
 * Re-exported from the store, which owns them now.
 *
 * Kept as a module so the many call sites that import `useShowcase` from here do
 * not all have to move — and because `isShowcaseEnabled` is imported by
 * non-React code (`main.tsx`), which must not pull in a `.tsx` file.
 */
export {
  isShowcaseEnabled,
  nextMockId,
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/showcase-store";
