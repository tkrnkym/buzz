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
    route("/forum", "forum.tsx"),
    route("/pulse", "pulse.tsx"),
    route("/reminders", "reminders.tsx"),
    route("/workflows", "workflows.tsx"),
    route("/workflows/$workflowId", "workflows.$workflowId.tsx"),
    route("/c", "c.tsx"),
    route("/c/$channelId", "chat.$channelId.tsx"),
    route("/home", "home.tsx"),
  ]),
  // Settings is its own full-window destination, outside the shell. With the rail
  // and the channel sidebar still on screen it read as a panel of the room the
  // reader was in, and their unread badges stayed in peripheral vision while they
  // were trying to change how the app behaves. `settings-nav.ts` has the rest.
  route("/settings", "settings.tsx"),
  route("/settings/$panel", "settings.$panel.tsx"),
  route("/invite/$code", "invite.$code.tsx"),
  // Onboarding sits outside the shell too: it needs no relay socket, and a
  // sidebar full of empty channels is the wrong first thing to show someone who
  // has not decided whether to install a signer yet.
  route("/welcome", "welcome.tsx"),
  // The repo browser is a separate destination, deliberately outside the shell:
  // it reads git over HTTP and needs no relay socket at all.
  route("/repos", "repos.tsx"),
  route("/repos/$repoId", "repos.$repoId.tsx"),
  route("/repos/$repoId/blob/$", "repos.$repoId.blob.$.tsx"),
]);
