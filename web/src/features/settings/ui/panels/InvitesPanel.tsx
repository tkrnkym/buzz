import { Check, Search, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MembersSettings } from "@/features/members/ui/MembersSettings";
import { ModerationQueue } from "@/features/moderation/ui/ModerationQueue";
import { MuteListSettings } from "@/features/moderation/ui/MuteListSettings";
import {
  SettingCard,
  SettingGroupHeading,
} from "@/features/settings/ui/SettingRow";
import { FIELD_CONTROL_CLASS, FieldShell } from "@/shared/ui/field-row";

/**
 * Invites: who is in, and how someone else gets in.
 *
 * Members live here rather than on a screen of their own, which is what the nav has
 * room for — and it is the right pairing anyway: the reason to open a member list is
 * usually that somebody is missing from it.
 *
 * The mute list and the moderation queue are also here. Neither has a nav item of
 * its own, and both are about people's access to the room, which is what this screen
 * is for. They are marked as separate sections rather than folded in, because one is
 * the reader's private list and the other is only readable by admins.
 */
export function InvitesPanel() {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const inviteUrl = useMemo(
    () => new URL("/invite/demo-code", window.location.href).href,
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FieldShell className="flex min-w-56 flex-1 items-center gap-2 px-3 py-2">
          <Search
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <input
            aria-label="メンバーを探す"
            className={FIELD_CONTROL_CLASS}
            data-testid="member-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search members"
            value={query}
          />
        </FieldShell>
        <button
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-2xs font-medium text-primary-foreground hover:bg-primary/90"
          data-testid="invite-to-community"
          onClick={() => {
            void navigator.clipboard
              .writeText(inviteUrl)
              .then(() => {
                setCopied(true);
                toast.success("招待リンクをコピーしました");
              })
              .catch(() => toast.error("コピーできませんでした"));
          }}
          type="button"
        >
          {copied ? (
            <Check aria-hidden className="size-3" />
          ) : (
            <UserPlus aria-hidden className="size-3" />
          )}
          Invite to community
        </button>
      </div>

      <MembersSettings query={query} />

      <SettingGroupHeading>ミュート</SettingGroupHeading>
      <SettingCard className="[&>*]:px-4 [&>*]:py-3.5">
        <div>
          <p className="mb-2 text-2xs text-muted-foreground">
            自分にだけ効く一覧です。リレーにもモデレーターにも何も要求しません。
          </p>
          <MuteListSettings />
        </div>
      </SettingCard>

      <SettingGroupHeading>モデレーション</SettingGroupHeading>
      <SettingCard className="[&>*]:px-4 [&>*]:py-3.5">
        <div>
          <p className="mb-2 text-2xs text-muted-foreground">
            通報の受付と、モデレーターが何をしたかの記録。オーナーと管理者だけが読めます。
          </p>
          <ModerationQueue />
        </div>
      </SettingCard>
    </div>
  );
}
