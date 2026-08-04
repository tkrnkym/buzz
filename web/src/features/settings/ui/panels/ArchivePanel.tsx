import {
  IdentityArchiveSettings,
  LocalArchiveSettings,
} from "@/features/archive/ui/ArchiveSettings";
import { SettingGroupHeading } from "@/features/settings/ui/SettingRow";

/**
 * Local archive: history kept on this device, and members who have left.
 *
 * The second list is here because it is the other thing "archive" means in this
 * product, and a reader looking for one will look here for the other.
 */
export function ArchivePanel() {
  return (
    <div className="flex flex-col gap-4">
      <LocalArchiveSettings />
      <SettingGroupHeading>アーカイブ済みのメンバー</SettingGroupHeading>
      <IdentityArchiveSettings />
    </div>
  );
}
