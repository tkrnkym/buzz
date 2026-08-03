import { Link } from "@tanstack/react-router";
import { FolderGit2 } from "lucide-react";

import nuxxAppIcon from "@/assets/app-icon@3x.png";
import { cn } from "@/shared/lib/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/**
 * The vertical rail on the far left, ported from the desktop client.
 *
 * The desktop app listed every configured community here and switched relays on
 * click. This client is scoped to one relay — the host it was served from — so
 * the rail shows that community plus the app-level destinations that sit outside
 * chat. The shape is kept because it is where the eye goes first and because
 * multi-community reads only need rows added, not a different layout.
 */
export function CommunityRail({
  communityName,
  hasUnread,
}: {
  communityName: string;
  hasUnread: boolean;
}) {
  return (
    <nav
      aria-label="Communities"
      className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar/60 py-3 md:flex"
      data-testid="community-rail"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            aria-label={hasUnread ? `${communityName} — unread` : communityName}
            className="relative flex size-9 items-center justify-center focus-visible:outline-none"
            data-testid="community-rail-active"
            to="/"
          >
            <span className="flex size-9 items-center justify-center overflow-hidden rounded-xl bg-primary text-xs font-semibold text-primary-foreground">
              <img
                alt=""
                className="size-full object-cover"
                src={nuxxAppIcon}
              />
            </span>
            {hasUnread && (
              <span
                className="absolute -bottom-0.5 -right-0.5 size-2 shrink-0 rounded-full bg-primary ring-2 ring-sidebar"
                data-testid="community-rail-unread-dot"
              >
                <span className="sr-only">unread</span>
              </span>
            )}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{communityName}</TooltipContent>
      </Tooltip>

      <span aria-hidden className="my-1 h-px w-6 bg-sidebar-border" />

      <RailLink label="Repositories" to="/repos">
        <FolderGit2 className="size-4" />
      </RailLink>
    </nav>
  );
}

function RailLink({
  children,
  label,
  to,
}: {
  children: React.ReactNode;
  label: string;
  to: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          aria-label={label}
          className={cn(
            "flex size-9 items-center justify-center rounded-2xl bg-sidebar-accent/60 text-sidebar-foreground/80 transition-all",
            "hover:rounded-xl hover:bg-primary/80 hover:text-primary-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            "aria-[current=page]:rounded-xl aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground",
          )}
          to={to}
        >
          {children}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
