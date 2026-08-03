import { useState } from "react";

import { useMyPubkey } from "@/features/chat/use-chat";
import { resolveUserLabel } from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { ProfilePopover } from "@/features/profile/ui/ProfilePopover";
import {
  useMyUserStatus,
  usePublishUserStatus,
} from "@/features/profile/use-profile";
import { useShell } from "@/features/shell/shell-context";
import { useRelayConnectionState } from "@/shared/api/relay-provider";
import { cn } from "@/shared/lib/cn";
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
 * The dot reflects the **relay connection** until the reader chooses a presence
 * of their own. Showing "online" while the socket is down would be a claim the
 * reader would act on; showing "connected" when they have deliberately gone
 * invisible would be worse.
 */
export function SidebarProfileCard({
  communityName,
}: {
  communityName: string;
}) {
  const pubkey = useMyPubkey();
  const connection = useRelayConnectionState();
  const signer = resolveSigner();
  const profiles = useProfiles(pubkey ? [pubkey] : []);
  const { status: userStatus, refresh: refreshUserStatus } = useMyUserStatus();
  const publishUserStatus = usePublishUserStatus();
  // Presence is owned by the shell, because the heartbeat that keeps it true has
  // to outlive this card being mounted.
  const { presence } = useShell();
  const [menuOpen, setMenuOpen] = useState(false);

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

  const label = resolveUserLabel({
    pubkey,
    profiles,
    // "You" is useless as the label on your own card.
    preferResolvedSelfLabel: true,
  });
  const connectionLabel = CONNECTION_LABEL[connection] ?? connection;
  // A chosen presence is a claim about intent; the connection is a fact. A
  // disconnected client cannot honestly be shown as online whatever it chose.
  const effectivePresence =
    connection === "ready" ? presence.status : "offline";
  const secondary = userStatus
    ? `${userStatus.emoji ? `${userStatus.emoji} ` : ""}${userStatus.text}`
    : connection === "ready"
      ? communityName
      : connectionLabel;

  return (
    <div className="relative">
      {menuOpen && (
        <ProfilePopover
          currentStatus={effectivePresence}
          onClearUserStatus={() =>
            publishUserStatus.mutate(
              { text: "", emoji: null },
              { onSuccess: refreshUserStatus },
            )
          }
          onClose={() => setMenuOpen(false)}
          onSetPresence={(status) => {
            presence.setStatus(status);
            setMenuOpen(false);
          }}
          onSetUserStatus={(input) =>
            publishUserStatus.mutate(input, { onSuccess: refreshUserStatus })
          }
          userStatus={userStatus}
        />
      )}

      <button
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        className="group/profile-card flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-border/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring dark:hover:bg-sidebar-border/30"
        data-testid="sidebar-profile-card"
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        <PubkeyAvatar
          badge={
            <span
              aria-label={`Presence: ${effectivePresence}`}
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-sidebar",
                effectivePresence === "online"
                  ? "bg-primary"
                  : effectivePresence === "away"
                    ? "bg-muted-foreground"
                    : "border border-muted-foreground bg-sidebar",
              )}
              data-testid="self-presence-badge"
              role="img"
            />
          }
          className="rounded-xl"
          label={label}
          pubkey={pubkey}
        />

        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-sm font-semibold leading-tight text-sidebar-foreground"
            data-testid="sidebar-profile-name"
          >
            {label}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-xs leading-snug text-sidebar-foreground/70">
            {!userStatus && (
              <span aria-hidden className="shrink-0">
                {connection === "ready" ? "🐝" : "⚠️"}
              </span>
            )}
            <span className="truncate" data-testid="sidebar-profile-secondary">
              {secondary}
            </span>
          </span>
        </span>

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
              This browser has no NIP-07 extension, so the key lives only for
              this page load. Reloading loses it.
            </TooltipContent>
          </Tooltip>
        )}
      </button>
    </div>
  );
}
