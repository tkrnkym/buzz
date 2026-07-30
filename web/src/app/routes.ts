import { index, route, rootRoute } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("root.tsx", [
  index("index.tsx"),
  // `/c` is a layout route so the relay WebSocket survives channel navigation.
  route("/c", "chat.tsx", [
    index("chat.index.tsx"),
    route("/$channelId", "chat.$channelId.tsx"),
  ]),
  route("/invite/$code", "invite.$code.tsx"),
  route("/repos", "repos.tsx"),
  route("/repos/$repoId", "repos.$repoId.tsx"),
  route("/repos/$repoId/blob/$", "repos.$repoId.blob.$.tsx"),
]);
