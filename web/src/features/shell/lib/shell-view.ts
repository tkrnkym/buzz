/**
 * Which section of the app a path belongs to.
 *
 * Derived rather than passed down: the shell is a layout route, so it renders
 * before the child route's component and cannot be told which one won.
 *
 * Explicit rather than "anything unrecognised is chat". That default was fine
 * with three routes and became a bug as soon as there were more — every new
 * section lit the Channels item up as if the reader were in a room.
 */
export type ShellView =
  | "chat"
  | "inbox"
  | "settings"
  | "browse"
  | "agents"
  | "projects"
  | "workflows"
  | "pulse"
  | "reminders"
  | "forum"
  | "other";

const PREFIXES: [prefix: string, view: ShellView][] = [
  ["/home", "inbox"],
  ["/settings", "settings"],
  ["/browse", "browse"],
  ["/agents", "agents"],
  ["/projects", "projects"],
  ["/workflows", "workflows"],
  ["/pulse", "pulse"],
  ["/reminders", "reminders"],
  ["/forum", "forum"],
];

export function resolveShellView(pathname: string): ShellView {
  for (const [prefix, view] of PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return view;
  }
  // The channel routes, and the index, which is the channel list.
  if (pathname === "/" || pathname === "/c" || pathname.startsWith("/c/")) {
    return "chat";
  }
  return "other";
}
