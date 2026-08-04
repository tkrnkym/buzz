import { Globe, Lock, Plus, Users } from "lucide-react";
import { useState } from "react";

import { JOIN_POLICY_LABELS } from "@/features/communities/community-model";
import { HostedCommunityFlow } from "@/features/communities/ui/HostedCommunityFlow";
import { SettingCard, SettingRow } from "@/features/settings/ui/SettingRow";
import { useShowcase } from "@/features/showcase/use-showcase";
import { NotWiredUp } from "@/features/showcase/ui/ShowcasePage";

const POLICY_ICON = { open: Globe, invite: Lock, closed: Users };

/**
 * Hosted communities: the ones provisioned rather than self-run.
 *
 * Only the hosted ones. A community reached by typing a relay URL has nothing on
 * this screen to manage — its settings live on that relay — and listing it here
 * would imply otherwise.
 */
export function HostedPanel() {
  const showcase = useShowcase();
  const [creating, setCreating] = useState(false);

  if (!showcase) {
    return <NotWiredUp what="ホスト型コミュニティ" />;
  }

  const hosted = showcase.communities.filter((row) => row.hosted);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <button
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-2xs font-medium text-primary-foreground hover:bg-primary/90"
          data-testid="create-hosted"
          onClick={() => setCreating(true)}
          type="button"
        >
          <Plus aria-hidden className="size-3" />
          コミュニティを作る
        </button>
      </div>

      {hosted.length === 0 ? (
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
          {hosted.map((community) => {
            const Icon = POLICY_ICON[community.joinPolicy];
            return (
              <SettingRow
                description={
                  <span className="flex flex-wrap items-center gap-x-3">
                    <code>{community.relayUrl}</code>
                    <span className="inline-flex items-center gap-1">
                      <Icon aria-hidden className="size-2.5" />
                      {JOIN_POLICY_LABELS[community.joinPolicy]}
                    </span>
                    <span>{community.memberCount} 人</span>
                  </span>
                }
                key={community.id}
                testId={`hosted-${community.id}`}
                title={community.name}
              />
            );
          })}
        </SettingCard>
      )}

      <HostedCommunityFlow onClose={() => setCreating(false)} open={creating} />
    </div>
  );
}
