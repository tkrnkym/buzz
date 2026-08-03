import { MessageSquareHeart } from "lucide-react";
import { useState } from "react";

import { AgentDefaultsSettings } from "@/features/agents/ui/AgentDefaultsSettings";
import {
  IdentityArchiveSettings,
  LocalArchiveSettings,
} from "@/features/archive/ui/ArchiveSettings";
import { ChannelTemplatesSettings } from "@/features/channels/ui/ChannelTemplatesSettings";
import { MeshComputeSettings } from "@/features/compute/ui/MeshComputeSettings";
import { EmojiSettings } from "@/features/emoji/ui/EmojiSettings";
import { SendFeedbackDialog } from "@/features/feedback/ui/SendFeedbackDialog";
import { HarnessSettings } from "@/features/harness/ui/HarnessSettings";
import { MembersSettings } from "@/features/members/ui/MembersSettings";
import { ModerationQueue } from "@/features/moderation/ui/ModerationQueue";
import { MuteListSettings } from "@/features/moderation/ui/MuteListSettings";
import { NotificationSettings } from "@/features/notifications/ui/NotificationSettings";
import {
  SETTINGS_PANELS,
  type SettingsPanelId,
} from "@/features/settings/settings-nav";
import { AccountPanel } from "@/features/settings/ui/AccountPanel";
import { Section } from "@/features/settings/ui/Section";
import { cn } from "@/shared/lib/cn";
import { SidebarTrigger } from "@/shared/ui/sidebar";

function CommunityPanel() {
  return (
    <>
      <Section
        description="このコミュニティに参加している人と、招待リンク。"
        title="メンバー"
      >
        <MembersSettings />
      </Section>

      <Section
        description="自分にだけ効く一覧です。リレーにもモデレーターにも何も要求しません。"
        title="ミュート"
      >
        <MuteListSettings />
      </Section>

      <Section
        description="通報の受付と、モデレーターが何をしたかの記録。オーナーと管理者だけが読めます。"
        title="モデレーション"
      >
        <ModerationQueue />
      </Section>
    </>
  );
}

function AgentsPanel() {
  return (
    <>
      <Section
        description="エージェントのターンを実際に動かすランタイム。入っていないものも一覧に残します — 次に知りたいのは入れ方なので。"
        title="ハーネス"
      >
        <HarnessSettings />
      </Section>

      <Section
        description="ローカルのエージェントが引き継ぐ設定。個別の指定が常に優先されます。"
        title="エージェントの既定値"
      >
        <AgentDefaultsSettings />
      </Section>
    </>
  );
}

function ChannelsPanel() {
  return (
    <>
      <Section
        description="繰り返し作る部屋の形。招くエージェントもいっしょに覚えます。"
        title="チャンネルテンプレート"
      >
        <ChannelTemplatesSettings />
      </Section>

      <Section
        description="自分で公開する絵文字です。あなたのチャンネルにいる人は誰でも使えます。見えるのは全員のものの合算で、ショートコードを誰かが独占することはありません。"
        title="カスタム絵文字"
      >
        <EmojiSettings />
      </Section>
    </>
  );
}

function AdvancedPanel() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <Section
        description="このマシンの計算資源を、コミュニティのエージェントに貸します。"
        title="計算資源の共有"
      >
        <MeshComputeSettings />
      </Section>

      <Section
        description="リレーが落ちていても読めるように、履歴の写しを手元に置きます。"
        title="ローカルアーカイブ"
      >
        <LocalArchiveSettings />
      </Section>

      <Section
        description="抜けたメンバーの扱い。一覧からは外れますが、発言は残ります。"
        title="アーカイブ済みのメンバー"
      >
        <IdentityArchiveSettings />
      </Section>

      <Section
        description="このリレーを運用している人に直接届きます。チャンネルには流れません。"
        title="フィードバック"
      >
        <button
          className="flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-2xs font-medium hover:bg-accent"
          data-testid="open-feedback"
          onClick={() => setFeedbackOpen(true)}
          type="button"
        >
          <MessageSquareHeart aria-hidden className="size-3" />
          フィードバックを送る
        </button>
        <SendFeedbackDialog
          onClose={() => setFeedbackOpen(false)}
          open={feedbackOpen}
        />
      </Section>
    </>
  );
}

const PANELS: Record<SettingsPanelId, () => React.ReactElement> = {
  account: AccountPanel,
  notifications: () => (
    <Section
      description="このブラウザだけの設定です。リレーには送りません — 机の上のPCと電車の中のスマホで答えが違うので。"
      title="通知"
    >
      <NotificationSettings />
    </Section>
  ),
  community: CommunityPanel,
  agents: AgentsPanel,
  channels: ChannelsPanel,
  advanced: AdvancedPanel,
};

/**
 * Settings.
 *
 * A left nav rather than one long scroll — see `settings-nav.ts` for why, and for
 * how the panels are grouped. The active panel lives in component state rather
 * than the URL: nobody deep-links to a settings tab, and a route per panel would
 * be six more entries in the route tree for no reader benefit.
 */
export function SettingsPage() {
  const [active, setActive] = useState<SettingsPanelId>("account");
  const ActivePanel = PANELS[active];

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <SidebarTrigger className="md:-ml-1" />
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        {/* Horizontal on a narrow screen, because a 200px column beside a form
            leaves neither enough room. */}
        <nav
          aria-label="Settings sections"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2 md:w-52 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r"
          data-testid="settings-nav"
        >
          {SETTINGS_PANELS.map((panel) => (
            <button
              aria-current={active === panel.id ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-2 text-left transition-colors md:shrink",
                active === panel.id
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              data-testid={`settings-nav-${panel.id}`}
              key={panel.id}
              onClick={() => setActive(panel.id)}
              type="button"
            >
              <span className="block whitespace-nowrap text-2xs font-medium">
                {panel.label}
              </span>
              <span className="hidden text-badge text-muted-foreground md:block">
                {panel.summary}
              </span>
            </button>
          ))}
        </nav>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 py-6">
            <ActivePanel />
          </div>
        </div>
      </div>
    </section>
  );
}
