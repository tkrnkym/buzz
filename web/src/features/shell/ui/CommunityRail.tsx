import { Link } from "@tanstack/react-router";
import { FolderGit2, Plus, Settings2 } from "lucide-react";
import { useState } from "react";

import nuxxAppIcon from "@/assets/app-icon@3x.png";
import {
  AddCommunityDialog,
  EditCommunityDialog,
} from "@/features/communities/ui/AddCommunityDialog";
import { HostedCommunityFlow } from "@/features/communities/ui/HostedCommunityFlow";
import { useShowcase } from "@/features/showcase/use-showcase";
import { cn } from "@/shared/lib/cn";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/**
 * The vertical rail on the far left, ported from the desktop client.
 *
 * The desktop app listed every configured community here and switched relays on
 * click. This client is scoped to one relay — the host it was served from — so the
 * community it is actually connected to sits at the top, and any others it knows
 * about are shown below as mock-ups: switching relays needs a session teardown
 * this client does not do yet, and a row that silently did nothing on click would
 * be worse than one that says so.
 *
 * Add and edit live here rather than in Settings because this is where a reader
 * looks when they want another community — the rail is the list, so it is also the
 * place to grow it.
 */
export function CommunityRail({
  communityName,
  hasUnread,
}: {
  communityName: string;
  hasUnread: boolean;
}) {
  const showcase = useShowcase();
  const [adding, setAdding] = useState(false);
  const [creatingHosted, setCreatingHosted] = useState(false);
  const [editing, setEditing] = useState(false);
  // The connected relay is the first row, so anything the mock also lists under
  // that URL would be a duplicate of it.
  const others = (showcase?.communities ?? []).filter(
    (row) => row.relayUrl !== relayWsUrl(),
  );

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

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={`${communityName} の設定`}
            className="flex size-7 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            data-testid="edit-community"
            onClick={() => setEditing(true)}
            type="button"
          >
            <Settings2 className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">コミュニティを編集</TooltipContent>
      </Tooltip>

      {others.map((community) => (
        <Tooltip key={community.id}>
          <TooltipTrigger asChild>
            <button
              aria-label={`${community.name}（まだ切り替えられません）`}
              className="flex size-9 items-center justify-center rounded-2xl bg-sidebar-accent/60 text-2xs font-semibold text-sidebar-foreground/60 transition-all hover:rounded-xl disabled:cursor-not-allowed"
              data-testid={`community-rail-${community.id}`}
              disabled
              type="button"
            >
              {community.name.slice(0, 2)}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {community.name} — 切り替えはまだできません
          </TooltipContent>
        </Tooltip>
      ))}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label="コミュニティを追加"
            className="flex size-9 items-center justify-center rounded-2xl border border-dashed border-sidebar-border text-sidebar-foreground/70 transition-all hover:rounded-xl hover:bg-sidebar-accent hover:text-sidebar-foreground"
            data-testid="add-community"
            onClick={() => setAdding(true)}
            type="button"
          >
            <Plus className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">コミュニティを追加</TooltipContent>
      </Tooltip>

      <span aria-hidden className="my-1 h-px w-6 bg-sidebar-border" />

      <RailLink label="Repositories" to="/repos">
        <FolderGit2 className="size-4" />
      </RailLink>

      <AddCommunityDialog
        onClose={() => setAdding(false)}
        onCreateHosted={() => setCreatingHosted(true)}
        open={adding}
      />
      <HostedCommunityFlow
        onClose={() => setCreatingHosted(false)}
        open={creatingHosted}
      />
      <EditCommunityDialog
        initialName={communityName}
        initialRelayUrl={relayWsUrl()}
        onClose={() => setEditing(false)}
        open={editing}
      />
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
