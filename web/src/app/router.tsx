import { createBrowserHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "@/app/routeTree.gen";

export const router = createRouter({
  routeTree,
  // Vite injects BASE_URL from its `base` option; "/" in normal builds, the
  // repo subpath on GitHub Pages.
  basepath: import.meta.env.BASE_URL,
  history: createBrowserHistory(),
  scrollRestoration: true,
  getScrollRestorationKey: (location: { pathname: string }) =>
    location.pathname,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
