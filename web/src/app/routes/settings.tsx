import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/settings` with no panel named.
 *
 * Redirects rather than rendering the first screen at a second URL: two addresses
 * for one screen means the nav's Profile row would not light up for someone who
 * arrived from the profile menu.
 */
export const Route = createFileRoute("/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/$panel", params: { panel: "profile" } });
  },
});
