/**
 * The settings surface: fifteen screens in three groups.
 *
 * Settings is its own full-window destination rather than a page inside the app
 * shell. It was a page, and that was wrong in a way that is easy to miss: with the
 * community rail and the channel sidebar still on screen, "settings" reads as a
 * panel of the room you were in, and the reader keeps their unread badges in
 * peripheral vision while trying to change how the app behaves. The desktop client
 * leaves the app entirely and offers one way back — which is why the nav's first
 * row is `← Back to app` rather than a close button.
 *
 * One screen per item, not one panel per subject area. The six-panel version
 * stacked several subjects into each — Profile, Appearance and the signing key all
 * lived under "アカウント" — so a screen's title could not say what the screen was
 * about, and every panel needed its own internal headings to compensate.
 *
 * Grouping is by *whose* setting it is: Personal is this reader on this device,
 * Communities is what they share with other people, App is the client itself.
 */

import {
  Archive,
  Bell,
  Bot,
  Cpu,
  Download,
  FlaskConical,
  Keyboard,
  LayoutTemplate,
  MessagesSquare,
  MonitorSmartphone,
  Smartphone,
  Smile,
  Ticket,
  User,
  Volume2,
  type LucideIcon,
} from "lucide-react";

export type SettingsPanelId =
  | "profile"
  | "appearance"
  | "notifications"
  | "voice"
  | "shortcuts"
  | "emoji"
  | "archive"
  | "hosted"
  | "templates"
  | "invites"
  | "agents"
  | "compute"
  | "experiments"
  | "mobile"
  | "updates";

export interface SettingsPanel {
  id: SettingsPanelId;
  label: string;
  Icon: LucideIcon;
  /** The one line under the screen's title, saying what the screen is for. */
  description: string;
}

export interface SettingsGroup {
  label: string;
  items: ReadonlyArray<SettingsPanel>;
}

export const SETTINGS_GROUPS: ReadonlyArray<SettingsGroup> = [
  {
    label: "Personal",
    items: [
      {
        id: "profile",
        label: "Profile",
        Icon: User,
        description:
          "名前・アイコン・自己紹介が Buzz でどう見えるかを変えます。",
      },
      {
        id: "appearance",
        label: "Appearance",
        Icon: MonitorSmartphone,
        description: "Buzz のテーマを選びます。",
      },
      {
        id: "notifications",
        label: "Notifications",
        Icon: Bell,
        description:
          "デスクトップ通知は既定で有効です。何を通すかを下で調整します。",
      },
      {
        id: "voice",
        label: "Voice",
        Icon: Volume2,
        description:
          "ハドル中に届いたエージェントの発言を読み上げるかどうかを決めます。",
      },
      {
        id: "shortcuts",
        label: "Shortcuts",
        Icon: Keyboard,
        description: "キーボードで手が届く操作の一覧です。",
      },
      {
        id: "emoji",
        label: "Custom emoji",
        Icon: Smile,
        description:
          "このリレーの全員が使える絵文字を追加します。メッセージやリアクションで :name: と入力します。",
      },
      {
        id: "archive",
        label: "Local archive",
        Icon: Archive,
        description:
          "リレーが落ちていても読めるように、履歴の写しを手元に置きます。",
      },
    ],
  },
  {
    label: "Communities",
    items: [
      {
        id: "hosted",
        label: "Hosted communities",
        Icon: MessagesSquare,
        description: "サーバを用意せずに立ち上げたコミュニティ。",
      },
      {
        id: "templates",
        label: "Templates",
        Icon: LayoutTemplate,
        description:
          "繰り返し作る部屋の形。招くエージェントもいっしょに覚えます。",
      },
      {
        id: "invites",
        label: "Invites",
        Icon: Ticket,
        description: "メンバーと、コミュニティへの入り方を管理します。",
      },
    ],
  },
  {
    label: "App",
    items: [
      {
        id: "agents",
        label: "Agents",
        Icon: Bot,
        description: "ハーネスと、ローカルのエージェントが引き継ぐ既定値。",
      },
      {
        id: "compute",
        label: "Compute",
        Icon: Cpu,
        description:
          "このマシンの計算資源を、コミュニティのエージェントに貸します。",
      },
      {
        id: "experiments",
        label: "Experiments",
        Icon: FlaskConical,
        description:
          "動きはしますが、まだ調整中の機能です。有効にすると先に試せます。",
      },
      {
        id: "mobile",
        label: "Mobile",
        Icon: Smartphone,
        description: "スマートフォンのアプリとこの端末をつなぎます。",
      },
      {
        id: "updates",
        label: "Updates",
        Icon: Download,
        description: "いま動いているバージョンと、変わったこと。",
      },
    ],
  },
];

/** Flat, in nav order. */
export const SETTINGS_PANELS: ReadonlyArray<SettingsPanel> =
  SETTINGS_GROUPS.flatMap((group) => group.items);

/** The panel a screen shows, or `null` when the id is not one. */
export function findSettingsPanel(id: unknown): SettingsPanel | null {
  return SETTINGS_PANELS.find((panel) => panel.id === id) ?? null;
}

/**
 * Resolve a panel id from a URL, falling back to the first one.
 *
 * Unknown values fall back rather than 404: a stale or hand-edited link should
 * still open Settings, and which panel it named is not load-bearing enough to fail
 * the page over.
 */
export function resolveSettingsPanel(id: unknown): SettingsPanelId {
  return findSettingsPanel(id)?.id ?? "profile";
}
