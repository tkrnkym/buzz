import { Volume2 } from "lucide-react";
import { toast } from "sonner";

import {
  resolveAvatarUrl,
  resolveUserLabel,
} from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import {
  useMuteList,
  useToggleMute,
} from "@/features/moderation/use-moderation";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

/**
 * Who the reader has muted, and the only place to undo it.
 *
 * It has to exist here, because muting hides the person from the timeline — which
 * means it also hides the menu that would unmute them. A feature whose off switch
 * is behind the thing it turns off is a trap.
 */
export function MuteListSettings() {
  const muted = useMuteList();
  const toggleMute = useToggleMute();
  const pubkeys = [...muted];
  const profiles = useProfiles(pubkeys);

  if (pubkeys.length === 0) {
    return (
      <p
        className="text-2xs text-muted-foreground"
        data-testid="mute-list-empty"
      >
        ミュートしている人はいません。メッセージのメニューからミュートできます。
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1" data-testid="mute-list">
      {pubkeys.map((pubkey) => {
        const label = resolveUserLabel({
          pubkey,
          profiles,
          preferResolvedSelfLabel: true,
        });
        return (
          <li
            className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50"
            key={pubkey}
          >
            <PubkeyAvatar
              avatarUrl={resolveAvatarUrl(pubkey, profiles)}
              className="rounded-full"
              label={label}
              pubkey={pubkey}
              size="sm"
            />
            <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
            <button
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-2xs font-medium hover:bg-accent disabled:opacity-60"
              data-testid={`unmute-${pubkey}`}
              disabled={toggleMute.isPending}
              onClick={() =>
                toggleMute.mutate(pubkey, {
                  onSuccess: () => toast.success("ミュートを解除しました"),
                  onError: (error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "解除できませんでした",
                    ),
                })
              }
              type="button"
            >
              <Volume2 aria-hidden className="size-3" />
              解除
            </button>
          </li>
        );
      })}
    </ul>
  );
}
