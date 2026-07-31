import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy home of the channel index.
 *
 * Chat moved to `/` when it became the top page. Links to `/c` are already in
 * the wild — shared URLs, the invite flow, bookmarks — so this redirects rather
 * than 404s, carrying any active search across so a shared search link still
 * lands on its results.
 */
export const Route = createFileRoute("/_shell/c")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/", search, replace: true });
  },
});
