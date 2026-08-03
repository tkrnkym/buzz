/**
 * The settings panels, in order.
 *
 * A left nav rather than one long scroll. The page grew from three sections to
 * twelve, and at that length a scroll stops being navigation — a reader looking
 * for the mute list ends up reading past the archive settings to find it.
 *
 * Grouping is by *who* changes a thing and how often, not by subsystem. Account
 * first because everyone touches it; the operator panels last because most
 * members never open them and the two moderator-only surfaces sit together where
 * a member can see they exist and are closed to them.
 */

export type SettingsPanelId =
  | "account"
  | "notifications"
  | "community"
  | "agents"
  | "channels"
  | "advanced";

export interface SettingsPanel {
  id: SettingsPanelId;
  label: string;
  /** What is in it, for the nav's second line. */
  summary: string;
}

export const SETTINGS_PANELS: ReadonlyArray<SettingsPanel> = [
  { id: "account", label: "アカウント", summary: "プロフィール・外観・鍵" },
  { id: "notifications", label: "通知", summary: "種類・音・デスクトップ通知" },
  {
    id: "community",
    label: "コミュニティ",
    summary: "メンバー・ミュート・モデレーション",
  },
  { id: "agents", label: "エージェント", summary: "ハーネス・既定値" },
  {
    id: "channels",
    label: "チャンネル",
    summary: "テンプレート・カスタム絵文字",
  },
  {
    id: "advanced",
    label: "その他",
    summary: "共有計算・アーカイブ・フィードバック",
  },
];

/**
 * Resolve a panel id from a URL, falling back to the first panel.
 *
 * Unknown values fall back rather than 404: a stale or hand-edited link should
 * still open Settings, and the panel it names is not load-bearing enough to fail
 * the page over.
 */
export function resolveSettingsPanel(value: unknown): SettingsPanelId {
  const match = SETTINGS_PANELS.find((panel) => panel.id === value);
  return match?.id ?? "account";
}
