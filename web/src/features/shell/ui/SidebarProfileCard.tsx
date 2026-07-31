import { useMyPubkey } from "@/features/chat/use-chat";
import { useRelayConnectionState } from "@/shared/api/relay-provider";
import { cn } from "@/shared/lib/cn";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { resolveSigner } from "@/shared/lib/signer";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";
import { Skeleton } from "@/shared/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

const CONNECTION_LABEL: Record<string, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  authenticating: "Authenticating…",
  ready: "Online",
  reconnecting: "Reconnecting…",
  closed: "Disconnected",
};

/**
 * The card at the foot of the sidebar, ported from the desktop client.
 *
 * The desktop version opened a profile popover with presence and custom-status
 * controls. Those need kind:0 profiles and presence publication, which arrive
 * with the profile module; until then this shows what is actually known — who
 * the reader is signing as, and whether that identity survives a reload.
 *
 * The dot reflects the **relay connection**, not a published presence status.
 * Showing "online" while the socket is down would be a claim the reader would
 * act on.
 */
export function SidebarProfileCard({
  communityName,
}: {
  communityName: string;
}) {
  const pubkey = useMyPubkey();
  const state = useRelayConnectionState();
  const signer = resolveSigner();

  if (!pubkey) {
    return (
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <Skeleton className="size-8 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    );
  }

  const connectionLabel = CONNECTION_LABEL[state] ?? state;

  return (
    <div
      className="group/profile-card flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sidebar-border/35 dark:hover:bg-sidebar-border/30"
      data-testid="sidebar-profile-card"
    >
      <PubkeyAvatar
        badge={
          <span
            aria-label={connectionLabel}
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-sidebar",
              state === "ready"
                ? "bg-primary"
                : state === "closed"
                  ? "bg-destructive"
                  : "bg-muted-foreground",
            )}
            data-testid="self-presence-badge"
            role="img"
          />
        }
        className="rounded-xl"
        pubkey={pubkey}
      />

      <div className="min-w-0 flex-1">
        <p
          className="truncate font-mono text-sm font-semibold leading-tight text-sidebar-foreground"
          data-testid="sidebar-profile-name"
        >
          {truncatePubkey(pubkey)}
        </p>
        <p className="flex min-w-0 items-center gap-1 text-xs leading-snug text-sidebar-foreground/70">
          <span aria-hidden className="shrink-0">
            {state === "ready" ? "🐝" : "⚠️"}
          </span>
          <span className="truncate">
            {state === "ready" ? communityName : connectionLabel}
          </span>
        </p>
      </div>

      {!signer.durable && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-badge font-medium text-secondary-foreground"
              data-testid="sidebar-temporary-identity"
            >
              temp
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            This browser has no NIP-07 extension, so the key lives only for this
            page load. Reloading loses it.
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
