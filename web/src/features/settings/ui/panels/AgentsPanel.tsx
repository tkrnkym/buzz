import { AgentDefaultsSettings } from "@/features/agents/ui/AgentDefaultsSettings";
import { HarnessSettings } from "@/features/harness/ui/HarnessSettings";
import { SettingGroupHeading } from "@/features/settings/ui/SettingRow";

/**
 * Agents: what runs them, and what they inherit.
 *
 * Two lists on one screen because the second only makes sense after the first —
 * the default harness is picked from the catalog above it.
 */
export function AgentsPanel() {
  return (
    <div className="flex flex-col gap-4">
      <SettingGroupHeading>Harnesses</SettingGroupHeading>
      <HarnessSettings />
      <SettingGroupHeading>Defaults</SettingGroupHeading>
      <AgentDefaultsSettings />
    </div>
  );
}
