import { index, layout, route, rootRoute } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("root.tsx", [
  // The app shell (community rail + sidebar + content) is a pathless layout
  // route so one authenticated WebSocket and one set of read cursors survive
  // navigation between channels and the inbox. A per-page wrapper would tear
  // both down and rebuild them on every click.
  layout("shell", "shell.tsx", [
    index("index.tsx"),
    route("/agents", "agents.tsx"),
    route("/browse", "browse.tsx"),
    route("/projects", "projects.tsx"),
    route("/projects/$projectId", "projects.$projectId.tsx"),
    route("/pulse", "pulse.tsx"),
    route("/reminders", "reminders.tsx"),
    route("/workflows", "workflows.tsx"),
    route("/workflows/$workflowId", "workflows.$workflowId.tsx"),
    route("/c", "c.tsx"),
    route("/c/$channelId", "chat.$channelId.tsx"),
    route("/home", "home.tsx"),
    route("/settings", "settings.tsx"),
  ]),
  route("/invite/$code", "invite.$code.tsx"),
  // The repo browser is a separate destination, deliberately outside the shell:
  // it reads git over HTTP and needs no relay socket at all.
  route("/repos", "repos.tsx"),
  route("/repos/$repoId", "repos.$repoId.tsx"),
  route("/repos/$repoId/blob/$", "repos.$repoId.blob.$.tsx"),
]);
