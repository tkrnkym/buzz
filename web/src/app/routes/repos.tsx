import { createFileRoute } from "@tanstack/react-router";

import { ReposPage } from "@/features/repos/ui/ReposPage";

/**
 * The repo browser.
 *
 * Was the top page while chat was still being built; it lives here now that
 * chat occupies `/`. This route used to redirect to `/` for that reason — the
 * redirect is gone, or the two would bounce off each other.
 */
export const Route = createFileRoute("/repos")({
  component: ReposPage,
});
