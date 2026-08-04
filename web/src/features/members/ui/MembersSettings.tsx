import { Copy, UserMinus, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { formatRelativeTime } from "@/features/agents/agent-model";
import {
  resolveAvatarUrl,
  resolveUserLabel,
  resolveUserSecondaryLabel,
} from "@/features/profile/profile-model";
import { useProfiles } from "@/features/profile/profile-store";
import {
  addMember,
  removeMember,
  setMemberRole,
  wouldOrphanCommunity,
} from "@/features/showcase/showcase-mutations";
import {
  useShowcase,
  useShowcaseUpdate,
} from "@/features/showcase/use-showcase";
import type { MemberRole } from "@/mock/showcase";
import { FormDialog } from "@/shared/ui/form-dialog";
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
export function MembersSettings({ query = "" }: { query?: string }) {
  const showcase = useShowcase();
  const update = useShowcaseUpdate();
  const [adding, setAdding] = useState(false);
  const nowSeconds = useMemo(() => Math.floor(Date.now() / 1000), []);
  const members = useMemo(
    () =>
      [...(showcase?.members ?? [])].sort(
        (left, right) => ROLE_RANK[left.role] - ROLE_RANK[right.role],
      ),
    [showcase],
  );
  // Profiles for everyone, not just the matches: the filter runs on the resolved
  // name, so narrowing the lookup to the current matches would mean a name that has
  // not loaded yet can never be searched for.
  const profiles = useProfiles(members.map((member) => member.pubkey));
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? members.filter((member) => {
        const label = resolveUserLabel({
          pubkey: member.pubkey,
          profiles,
          preferResolvedSelfLabel: true,
        });
        // The pubkey is searchable too: it is what a moderator has to hand when
        // someone is reported, and it is not always resolvable to a name.
        return (
          label.toLowerCase().includes(needle) ||
          member.pubkey.toLowerCase().includes(needle)
        );
      })
    : members;

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
        {shown.length === 0 && (
          <li className="px-2 py-1.5 text-2xs text-muted-foreground">
            該当するメンバーはいません。
          </li>
        )}
        {shown.map((member) => {
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
              {update ? (
                <select
                  aria-label={`${label} の役割`}
                  className="h-7 shrink-0 rounded-md border border-border bg-background px-1.5 text-badge"
                  data-testid={`member-role-${member.pubkey}`}
                  onChange={(event) => {
                    const role = event.target.value as MemberRole;
                    // Refused rather than silently ignored: a community with no
                    // owner has nobody who can promote one, so the reader has to
                    // be told why nothing happened.
                    if (wouldOrphanCommunity(members, member.pubkey, role)) {
                      toast.error(
                        "最後のオーナーは降格できません。先に別のオーナーを立ててください。",
                      );
                      return;
                    }
                    update((current) =>
                      setMemberRole(current, member.pubkey, role),
                    );
                    toast.success(`${label} を${ROLE_LABELS[role]}にしました`);
                  }}
                  value={member.role}
                >
                  {(["owner", "admin", "member"] as MemberRole[]).map(
                    (role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ),
                  )}
                </select>
              ) : (
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
              )}
              {update && (
                <button
                  aria-label={`${label} を外す`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10"
                  data-testid={`remove-member-${member.pubkey}`}
                  onClick={() => {
                    if (
                      wouldOrphanCommunity(members, member.pubkey, "member")
                    ) {
                      toast.error(
                        "最後のオーナーは外せません。先に別のオーナーを立ててください。",
                      );
                      return;
                    }
                    update((current) => removeMember(current, member.pubkey));
                    toast.success(`${label} を外しました`);
                  }}
                  type="button"
                >
                  <UserMinus aria-hidden className="size-3" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium disabled:opacity-60"
          data-testid="add-member"
          disabled={update === null}
          onClick={() => setAdding(true)}
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

      {adding && update && (
        <FormDialog
          description="公開鍵を貼ると、このコミュニティのメンバーになります。"
          fields={[
            {
              name: "pubkey",
              label: "公開鍵",
              placeholder: "64桁の16進数",
              required: true,
              hint: "招待リンクを渡すほうが普通ですが、鍵がわかっているなら直接足せます。",
            },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={(values) => {
            const pubkey = values.pubkey.trim().toLowerCase();
            if (!/^[0-9a-f]{64}$/.test(pubkey)) {
              toast.error("公開鍵は64桁の16進数です。");
              return;
            }
            update((current) =>
              addMember(current, {
                pubkey,
                role: "member",
                joinedAt: Math.floor(Date.now() / 1000),
                timeoutUntil: null,
              }),
            );
            setAdding(false);
            toast.success("追加しました");
          }}
          submitLabel="追加する"
          testId="add-member-dialog"
          title="メンバーを追加"
        />
      )}
    </div>
  );
}
