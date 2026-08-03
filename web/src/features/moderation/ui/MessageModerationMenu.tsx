import {
  Ban,
  CircleSlash,
  EllipsisVertical,
  Flag,
  ShieldCheck,
  VolumeX,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useMyPubkey } from "@/features/chat/use-chat";
import { useCanModerate } from "@/features/directory/use-directory";
import {
  findRestriction,
  isTimedOut,
  TIMEOUT_PRESETS,
  timeoutExpiresAt,
} from "@/features/moderation/moderation-model";
import { ReportMessageDialog } from "@/features/moderation/ui/ReportMessageDialog";
import {
  useBanMember,
  useMuteList,
  useRestrictions,
  useTimeoutMember,
  useToggleMute,
  useUnbanMember,
  useUntimeoutMember,
} from "@/features/moderation/use-moderation";
import { normalizePubkey } from "@/features/profile/profile-model";
import {
  Menu,
  MenuChoice,
  MenuGroup,
  MenuItem,
  MenuSeparator,
} from "@/shared/ui/menu";

/**
 * The moderation menu on a message row.
 *
 * Two audiences in one control, which is why it is one control. Anyone can report
 * and anyone can mute — a mute is the reader's own list and asks nothing of
 * anyone. Timeout and ban appear only for an owner or admin, and only against
 * someone else: a menu offering to ban yourself is a bug in the shape of a
 * feature.
 *
 * Every action here is a request. The relay validates the actor's role and may
 * refuse, so nothing is reflected optimistically — the restricted list is
 * re-read, and until it comes back the label is the one that was true before.
 */
export function MessageModerationMenu({
  authorPubkey,
  messageId,
}: {
  authorPubkey: string;
  messageId: string;
}) {
  const myPubkey = useMyPubkey();
  const canModerate = useCanModerate();
  const [reporting, setReporting] = useState(false);

  const restrictions = useRestrictions();
  const muted = useMuteList();
  const toggleMute = useToggleMute();
  const ban = useBanMember();
  const unban = useUnbanMember();
  const timeout = useTimeoutMember();
  const untimeout = useUntimeoutMember();

  const isSelf =
    myPubkey !== null &&
    normalizePubkey(authorPubkey) === normalizePubkey(myPubkey);
  const restriction = findRestriction(restrictions.data, authorPubkey);
  const isBanned = restriction?.banned ?? false;
  const timedOut = isTimedOut(restriction?.mutedUntil);
  const isMuted = muted.has(normalizePubkey(authorPubkey));

  const pending =
    ban.isPending ||
    unban.isPending ||
    timeout.isPending ||
    untimeout.isPending ||
    toggleMute.isPending;

  // Nothing on this menu applies to the reader's own message: reporting or
  // muting yourself is not a thing, and neither is moderating yourself.
  if (isSelf) return null;

  const run = (
    action: Promise<unknown>,
    success: string,
    close: () => void,
  ) => {
    close();
    action
      .then(() => toast.success(success))
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error ? error.message : "操作できませんでした",
        ),
      );
  };

  return (
    <>
      <Menu
        label="このメッセージへの操作"
        testId={`message-moderation-${messageId}`}
        trigger={<EllipsisVertical />}
      >
        {(close) => (
          <>
            <MenuItem
              icon={<Flag />}
              onClick={() => {
                close();
                setReporting(true);
              }}
              testId={`report-message-${messageId}`}
            >
              通報する
            </MenuItem>

            <MenuItem
              disabled={pending}
              icon={isMuted ? <Volume2 /> : <VolumeX />}
              onClick={() =>
                run(
                  toggleMute.mutateAsync(authorPubkey),
                  isMuted ? "ミュートを解除しました" : "ミュートしました",
                  close,
                )
              }
              testId={`mute-author-${messageId}`}
            >
              {isMuted ? "ミュートを解除" : "この人をミュート"}
            </MenuItem>

            {canModerate && (
              <>
                <MenuSeparator />

                {timedOut ? (
                  <MenuItem
                    disabled={pending}
                    icon={<ShieldCheck />}
                    onClick={() =>
                      run(
                        untimeout.mutateAsync(authorPubkey),
                        "タイムアウトを解除しました",
                        close,
                      )
                    }
                    testId={`untimeout-author-${messageId}`}
                  >
                    タイムアウトを解除
                  </MenuItem>
                ) : (
                  <MenuGroup label="投稿者をタイムアウト">
                    {TIMEOUT_PRESETS.map((preset) => (
                      <MenuChoice
                        disabled={pending}
                        key={preset.seconds}
                        onClick={() =>
                          run(
                            timeout.mutateAsync({
                              pubkey: authorPubkey,
                              expiresAt: timeoutExpiresAt(preset.seconds),
                            }),
                            `${preset.label}のタイムアウトを適用しました`,
                            close,
                          )
                        }
                        testId={`timeout-author-${preset.seconds}-${messageId}`}
                      >
                        {preset.label}
                      </MenuChoice>
                    ))}
                  </MenuGroup>
                )}

                {isBanned ? (
                  <MenuItem
                    disabled={pending}
                    icon={<CircleSlash />}
                    onClick={() =>
                      run(
                        unban.mutateAsync(authorPubkey),
                        "BANを解除しました",
                        close,
                      )
                    }
                    testId={`unban-author-${messageId}`}
                  >
                    BANを解除
                  </MenuItem>
                ) : (
                  <MenuItem
                    destructive
                    disabled={pending}
                    icon={<Ban />}
                    onClick={() =>
                      run(
                        ban.mutateAsync({ pubkey: authorPubkey }),
                        "コミュニティからBANしました",
                        close,
                      )
                    }
                    testId={`ban-author-${messageId}`}
                  >
                    コミュニティからBAN
                  </MenuItem>
                )}
              </>
            )}
          </>
        )}
      </Menu>

      {/* Mounted only while open. A `<dialog>` per row would otherwise sit in the
          DOM once for every message on screen — thirty closed dialogs, and a
          `data-testid` that matches all of them. */}
      {reporting && (
        <ReportMessageDialog
          authorPubkey={authorPubkey}
          eventId={messageId}
          onClose={() => setReporting(false)}
          open
        />
      )}
    </>
  );
}
