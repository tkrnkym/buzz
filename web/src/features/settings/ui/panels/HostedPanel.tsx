import { ExternalLink, Plus } from "lucide-react";
import { useState } from "react";

import { JOIN_POLICY_LABELS } from "@/features/communities/community-model";
import { HostedCommunityFlow } from "@/features/communities/ui/HostedCommunityFlow";
import {
  SettingCard,
  SettingGroupHeading,
  SettingRow,
} from "@/features/settings/ui/SettingRow";
import { useShowcase } from "@/features/showcase/use-showcase";

/**
 * Hosted communities.
 *
 * This is the one screen that is about a service rather than about the app: Buzz
 * works with any relay, and this page exists only for managed relay hosting, which
 * needs its own account. Saying that first matters — without it the screen reads as
 * a sign-in wall in front of the product, and it is not one.
 *
 * The sign-in is not wired up in this client, and the button says so rather than
 * opening something that will not come back. A button that reports success and does
 * nothing is the failure this codebase has already been through once.
 */
export function HostedPanel() {
  const showcase = useShowcase();
  const [creating, setCreating] = useState(false);
  const hosted = (showcase?.communities ?? []).filter((row) => row.hosted);

  return (
    <div className="flex flex-col gap-6">
      <SettingCard testId="hosted-signin">
        <div className="flex flex-col gap-3 px-4 py-4">
          <div>
            <h2 className="text-base font-semibold">サインインして管理する</h2>
            <p className="mt-1 text-2xs text-muted-foreground">
              認証はブラウザで開いて Buzz
              に戻ります。ほかの機能はサインインなしで全部使えます。
            </p>
          </div>
          <button
            className="flex w-fit items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-2xs font-medium text-primary-foreground disabled:opacity-60"
            data-testid="hosted-signin-button"
            disabled
            type="button"
          >
            <ExternalLink aria-hidden className="size-3" />
            ホスティングにサインイン
          </button>
          <p className="text-badge text-muted-foreground">
            {/* Disabled with the reason on screen. The alternative — a button that
                opens nothing — is the thing this client keeps being caught doing. */}
            このクライアントにはまだホスティングのサインインがありません。デモの作成フローは下から試せます。
          </p>
        </div>
      </SettingCard>

      <div className="flex items-center justify-between gap-3">
        <SettingGroupHeading>デモの作成フロー</SettingGroupHeading>
        <button
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent disabled:opacity-60"
          data-testid="create-hosted"
          disabled={showcase === null}
          onClick={() => setCreating(true)}
          type="button"
        >
          <Plus aria-hidden className="size-3" />
          コミュニティを作る
        </button>
      </div>

      {showcase === null ? (
        <SettingCard>
          <p className="px-4 py-3.5 text-2xs text-muted-foreground">
            ホスト型コミュニティの一覧はまだリレーから読めていません。
          </p>
        </SettingCard>
      ) : hosted.length === 0 ? (
        <SettingCard>
          <p
            className="px-4 py-3.5 text-2xs text-muted-foreground"
            data-testid="hosted-empty"
          >
            ホスト型のコミュニティはまだありません。
          </p>
        </SettingCard>
      ) : (
        <SettingCard testId="hosted-list">
          {hosted.map((community) => (
            <SettingRow
              description={
                <span className="flex flex-wrap items-center gap-x-3">
                  <code>{community.relayUrl}</code>
                  <span>{JOIN_POLICY_LABELS[community.joinPolicy]}</span>
                  <span>{community.memberCount} 人</span>
                </span>
              }
              key={community.id}
              testId={`hosted-${community.id}`}
              title={community.name}
            />
          ))}
        </SettingCard>
      )}

      <HostedCommunityFlow onClose={() => setCreating(false)} open={creating} />
    </div>
  );
}
