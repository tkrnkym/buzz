import { Plus } from "lucide-react";
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
 * This is the one screen that is about a service rather than about the app: Nuxx
 * works with any relay, and this page exists only for the hosting Nuxx provides.
 * Saying that first matters — without it the screen reads as a wall in front of
 * the product, and it is not one.
 *
 * The Block/Builderlab sign-in the desktop client had is gone rather than
 * ported. It belonged to the product this one was forked from: a Nuxx workspace
 * signs in at its own account host (see the Workspace screen), and reproducing
 * another company's identity provider would have been faithful to a screenshot
 * and wrong about the product.
 */
export function HostedPanel() {
  const showcase = useShowcase();
  const [creating, setCreating] = useState(false);
  const hosted = (showcase?.communities ?? []).filter((row) => row.hosted);

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <p className="px-4 py-3.5 text-2xs text-muted-foreground">
          Nuxx
          はどのリレーでも動きます。自分で運用しているリレーがあるなら、この画面は使いません。
        </p>
      </SettingCard>

      <div className="flex items-center justify-between gap-3">
        <SettingGroupHeading>ホスト型コミュニティ</SettingGroupHeading>
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
