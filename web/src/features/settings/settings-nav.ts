/**
 * The settings surface: twenty screens in three groups.
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
  Building2,
  Bot,
  Cpu,
  Database,
  Download,
  FlaskConical,
  Keyboard,
  KeyRound,
  LayoutTemplate,
  MessagesSquare,
  MonitorSmartphone,
  Radio,
  ShieldCheck,
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
  | "workspace"
  | "security"
  | "secrets"
  | "data"
  | "agents"
  | "compute"
  | "experiments"
  | "privacy"
  | "mobile"
  | "updates";

export interface SettingsPanel {
  id: SettingsPanelId;
  /** The nav row, which has a 64px column to fit in. */
  label: string;
  /**
   * The screen's heading, when it differs from the nav row.
   *
   * "Compute" is enough in a list of twenty; on the screen itself the heading has
   * a whole line to be specific with, and "Share compute" says what the screen does
   * rather than what subject it belongs to.
   */
  title?: string;
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
          "名前・アイコン・自己紹介が Nuxx でどう見えるかを変えます。",
      },
      {
        id: "appearance",
        label: "Appearance",
        Icon: MonitorSmartphone,
        description: "Nuxx のテーマを選びます。",
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
        description:
          "Nuxx はどのリレーでも動きます。この画面は、Nuxx が用意するホスティングを使う場合のためのものです。",
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
      {
        id: "workspace",
        label: "Workspace",
        Icon: Building2,
        description:
          "この Workspace のアドレスと、サインインが切れるまでの時間。",
      },
      {
        id: "security",
        label: "Security",
        title: "Approval Policies",
        Icon: ShieldCheck,
        description:
          "何に承認が要るか、そして返事がないまま何日で期限切れにするかを決めます。",
      },
      {
        id: "secrets",
        label: "Secrets",
        Icon: KeyRound,
        description:
          "エージェント・ワークフロー・プラグインが使う秘密情報を預かります。値そのものは、登録後どの画面にも出しません。",
      },
      {
        id: "data",
        label: "Data",
        title: "Data & Retention",
        Icon: Database,
        description:
          "データがどこに置かれ、どれだけ残るか。消したあとバックアップから消えるまでの時間も含めて書いています。",
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
        description:
          "会話でのエージェントのふるまいと、このマシンでの動かし方を決めます。",
      },
      {
        id: "compute",
        label: "Compute",
        title: "Share compute",
        Icon: Cpu,
        description:
          "このマシンをリレーと共有します。オンのあいだ、ほかのメンバーが自分のエージェントをここで動かせます。",
      },
      {
        id: "experiments",
        label: "Experiments",
        Icon: FlaskConical,
        description:
          "動きはしますが、まだ調整中の機能です。有効にすると先に試せます。",
      },
      {
        id: "privacy",
        label: "Privacy",
        title: "Telemetry & Federation",
        Icon: Radio,
        description:
          "この配備から何が外に出るか。そして、公開したものを取り下げたときに何が起きるか。",
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
        title: "Software Updates",
        Icon: Download,
        description: "Nuxx を最新の機能と修正に追いつかせます。",
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
