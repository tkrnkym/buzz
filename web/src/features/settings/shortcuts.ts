/**
 * The keyboard shortcuts, as a list.
 *
 * A registry rather than a hand-written help page, because a help page is a second
 * copy of a truth that lives in twelve components — and the copy is what goes stale.
 * Every entry here names a key combination the app actually handles; the Shortcuts
 * screen renders this and nothing else, so a shortcut that is removed from the code
 * and left here is visible as a row that does nothing rather than invisible.
 *
 * Rebinding is deliberately absent. The handlers are local to their components (Esc
 * closes the dialog you are in, Enter sends in the composer you are typing in), so a
 * rebinding UI would have to promise something the architecture does not support yet.
 * The screen says that rather than showing controls that cannot work.
 */

export interface Shortcut {
  keys: ReadonlyArray<string>;
  action: string;
  /** Where it applies, so a reader knows why it did nothing elsewhere. */
  scope: string;
}

export interface ShortcutGroup {
  label: string;
  items: ReadonlyArray<Shortcut>;
}

export const SHORTCUT_GROUPS: ReadonlyArray<ShortcutGroup> = [
  {
    label: "書く",
    items: [
      { keys: ["Enter"], action: "送信する", scope: "メッセージ入力欄" },
      {
        keys: ["Shift", "Enter"],
        action: "改行する",
        scope: "メッセージ入力欄",
      },
      {
        keys: ["Esc"],
        action: "返信をやめる・編集をやめる",
        scope: "メッセージ入力欄",
      },
      {
        keys: ["↑", "↓"],
        action: "候補を選ぶ",
        scope: "メンション・絵文字の候補",
      },
      { keys: ["Tab"], action: "候補を確定する", scope: "メンションの候補" },
    ],
  },
  {
    label: "移動する",
    items: [
      {
        keys: ["Ctrl", "B"],
        action: "サイドバーを開閉する",
        scope: "アプリ全体",
      },
      {
        keys: ["↑", "↓"],
        action: "一覧の中を移動する",
        scope: "チャンネル一覧・メニュー",
      },
      { keys: ["Esc"], action: "閉じる", scope: "ダイアログ・メニュー" },
    ],
  },
];

export const SHORTCUTS: ReadonlyArray<Shortcut> = SHORTCUT_GROUPS.flatMap(
  (group) => group.items,
);

/**
 * A shortcut's keys, with an identity each.
 *
 * A key sequence has no ids and repeats are legitimate — a future `G G` would be two
 * presses of the same key — so identity is constructed as "the nth key of this
 * shortcut". `plus` carries whether a separator precedes it, which keeps that
 * decision out of the markup.
 */
export function keyChips(
  shortcut: Shortcut,
): { key: string; label: string; plus: boolean }[] {
  return shortcut.keys.map((label, position) => ({
    key: `${shortcut.scope}:${shortcut.action}:${position + 1}`,
    label,
    plus: position > 0,
  }));
}
