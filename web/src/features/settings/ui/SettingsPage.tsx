import { findSettingsPanel } from "@/features/settings/settings-nav";
import { AgentsPanel } from "@/features/settings/ui/panels/AgentsPanel";
import { AppearancePanel } from "@/features/settings/ui/panels/AppearancePanel";
import { ArchivePanel } from "@/features/settings/ui/panels/ArchivePanel";
import { ComputePanel } from "@/features/settings/ui/panels/ComputePanel";
import { EmojiPanel } from "@/features/settings/ui/panels/EmojiPanel";
import { ExperimentsPanel } from "@/features/settings/ui/panels/ExperimentsPanel";
import { HostedPanel } from "@/features/settings/ui/panels/HostedPanel";
import { InvitesPanel } from "@/features/settings/ui/panels/InvitesPanel";
import { MobilePanel } from "@/features/settings/ui/panels/MobilePanel";
import { NotificationsPanel } from "@/features/settings/ui/panels/NotificationsPanel";
import { ProfilePanel } from "@/features/settings/ui/panels/ProfilePanel";
import { ShortcutsPanel } from "@/features/settings/ui/panels/ShortcutsPanel";
import { TemplatesPanel } from "@/features/settings/ui/panels/TemplatesPanel";
import { UpdatesPanel } from "@/features/settings/ui/panels/UpdatesPanel";
import { VoicePanel } from "@/features/settings/ui/panels/VoicePanel";
import { SettingsShell } from "@/features/settings/ui/SettingsShell";
import type { SettingsPanelId } from "@/features/settings/settings-nav";

/**
 * Which component draws which screen.
 *
 * A record keyed by the panel id, so adding a nav entry without a screen is a type
 * error rather than a blank page.
 */
const PANELS: Record<SettingsPanelId, () => React.ReactElement> = {
  profile: ProfilePanel,
  appearance: AppearancePanel,
  notifications: NotificationsPanel,
  voice: VoicePanel,
  shortcuts: ShortcutsPanel,
  emoji: EmojiPanel,
  archive: ArchivePanel,
  hosted: HostedPanel,
  templates: TemplatesPanel,
  invites: InvitesPanel,
  agents: AgentsPanel,
  compute: ComputePanel,
  experiments: ExperimentsPanel,
  mobile: MobilePanel,
  updates: UpdatesPanel,
};

/**
 * Settings.
 *
 * The panel comes from the URL, so every screen is linkable and the back button
 * walks through them — see `settings-nav.ts` for why this is a window of its own.
 */
export function SettingsPage({ panel }: { panel: string }) {
  // Falls back rather than 404s: a stale link should still open Settings.
  const resolved = findSettingsPanel(panel) ?? findSettingsPanel("profile");
  if (!resolved) return null;
  const Panel = PANELS[resolved.id];

  return (
    <SettingsShell panel={resolved}>
      <Panel />
    </SettingsShell>
  );
}
