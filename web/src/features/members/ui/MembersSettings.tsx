import { Copy, UserPlus } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  resolveAvatarUrl,
  resolveUserLabel,
  resolveUserSecondaryLabel,
} from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import { useShowcase } from "@/features/showcase/use-showcase";
import type { MemberRole } from "@/mock/showcase";
import { cn } from "@/shared/lib/cn";
import { PubkeyAvatar } from "@/shared/ui/PubkeyAvatar";

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
};

const ROLE_RANK: Record<MemberRole, number> = { owner: 0, admin: 1, member: 2 };

/**
 * Who is in the community, and how to add someone.
 *
 * In Settings rather than on a screen of its own: membership is something an
 * admin changes occasionally and everyone else only reads, which is exactly
 * what a settings section is for. The desktop client put it in the same place.
 */
export function MembersSettings() {
  const showcase = useShowcase();
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);
  const members = useMemo(
    () =>
      [...(showcase?.members ?? [])].sort(
        (left, right) => ROLE_RANK[left.role] - ROLE_RANK[right.role],
      ),
    [showcase],
  );
  const profiles = useProfiles(members.map((member) => member.pubkey));

  if (!showcase) {
    return (
      <p className="text-2xs text-muted-foreground">
        メンバー一覧はまだリレーから読めていません。
      </p>
    );
  }

  const inviteUrl = new URL("/invite/demo-code", window.location.href).href;

  return (
    <div className="flex flex-col gap-4" data-testid="members-settings">
      <ul className="flex flex-col gap-1">
        {members.map((member) => {
          const label = resolveUserLabel({
            pubkey: member.pubkey,
            profiles,
            preferResolvedSelfLabel: true,
          });
          return (
            <li
              className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50"
              key={member.pubkey}
            >
              <PubkeyAvatar
                avatarUrl={resolveAvatarUrl(member.pubkey, profiles)}
                className="rounded-full"
                label={label}
                pubkey={member.pubkey}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{label}</p>
                <p className="truncate text-badge text-muted-foreground">
                  {resolveUserSecondaryLabel({
                    pubkey: member.pubkey,
                    profiles,
                  }) ?? ""}{" "}
                  · {formatRelativeTime(member.joinedAt, nowSeconds)}に参加
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-badge font-medium",
                  member.role === "member"
                    ? "bg-muted text-muted-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {ROLE_LABELS[member.role]}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium disabled:opacity-60"
          disabled
          type="button"
        >
          <UserPlus aria-hidden className="size-3" />
          メンバーを追加
        </button>
        <button
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium"
          data-testid="copy-invite-link"
          onClick={() => {
            void navigator.clipboard
              .writeText(inviteUrl)
              .then(() => toast.success("招待リンクをコピーしました"))
              .catch(() => toast.error("コピーできませんでした"));
          }}
          type="button"
        >
          <Copy aria-hidden className="size-3" />
          招待リンクをコピー
        </button>
      </div>
    </div>
  );
}
