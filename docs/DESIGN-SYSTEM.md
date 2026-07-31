# デザインシステム

web（React + Tailwind）と mobile（Flutter）で同じ見た目を目指す。配色の共通基盤は
**Catppuccin**（ライト = Latte、ダーク = Macchiato）。

関連: [FEATURES.md](FEATURES.md) · web の規約詳細は [AGENTS.md](../AGENTS.md)

---

## 1. カラー

### 定義場所

| サーフェス | 実体 |
|---|---|
| web | `web/src/shared/styles/globals.css` の CSS カスタムプロパティ **105 個**。`:root` = ライト、`.dark` = ダーク |
| mobile | `mobile/lib/shared/theme/`（`nuxx_theme.dart` ほか）。テーマ名 `nuxx` / `nuxx-dark` |

### 構造（web）

shadcn/ui 系の意味論トークン（HSL 三成分で保持、`hsl(var(--…))` で使用）:

- 基本: `--background` `--foreground` `--card` `--popover` `--muted` `--accent`
  `--destructive` `--border` `--input` `--ring` （各 `-foreground` 対）
- ブランド: `--primary`（紫系: ライト `266 85% 58%` / ダーク `267 83% 80%`）
- サイドバー専用系: `--sidebar-*`（background / active / accent / border …）
- 機能特化: `--huddle-*`（通話 UI）、`--nuxx-gradient-*`（オンボーディング背景）、
  `--nuxx-hosted-community-*`（ホスト型コミュニティ画面）、`--chart-1..5`
- 角丸基準: `--radius: 0.625rem`（10px）

**新しい色はまずトークンとして追加する。** コンポーネントへの生 HSL/HEX 直書きは
しない（Tailwind が未定義ユーティリティを黙って捨てるため、欠けが目視できない）。

## 2. タイポグラフィ（web） — 最重要規約

フォント: `Inter Variable, Inter, "Avenir Next", "Segoe UI", sans-serif`

**px 禁止・rem 必須。** ブラウザズームは `<html>` の font-size を拡縮するので、
rem だけがズームに追随する。px 指定はズームに対して凍結する。

- ✅ 標準トークン: `text-base`(16) `text-sm`(14) `text-xs`(12) …
  **チャット本文と発言者名は `text-base`** — これがアプリの基準サイズで、
  タイムラインの周辺要素（時刻・システム行・コード・リアクション）は同じ
  標準ラダー上の段。
- ✅ 命名済み拡張トークン（`web/tailwind.config.js` → `theme.extend.fontSize`）:

  | トークン | 値 | 用途 |
  |---|---|---|
  | `text-2xs` | 0.6875rem (11px) | メタ情報の主力（時刻・バッジ） |
  | `text-3xs` | 0.5rem (8px) | 極小グリフ |
  | `badge` | 0.625rem (10px) | ステータスバッジ |
  | `title` | 2.5rem + tracking -0.02em | オンボーディング見出し |
  | `nsec-key` | 2.25rem | 鍵バックアップ表示 |

- ❌ `text-[15px]`、CSS `font-size: 13px`
- ❌ `text-[0.6875rem]` のような任意 rem リテラルも不可（スケールを再断片化する）。
  必要なら命名トークンを **追加** する。

CI ガード `pnpm -C web check:px-text`（`web/scripts/check-px-text.mjs`）が
`web/src` 全域を走査し、px・rem/em を問わず新規の任意サイズリテラルで fail する。

## 3. スペーシング・角丸（mobile）

生数値は使わず、必ずトークンを通す。

**Grid**（`lib/shared/theme/grid.dart`）:

| | quarter | half | xxs | twelve | xs | gutter | sm | md | lg | xl | xxl | xxxl |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| px | 2 | 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 |

**Radii**（`lib/shared/theme/app_theme.dart`）:

| | xs | sm | md | lg | card | dialog | full |
|---|---|---|---|---|---|---|---|
| px | 4 | 6 | 8 | 10 | 12 | 24 | 999 |

## 4. 実装規約

### web

- React 19 + Vite + Tailwind。lint/format は **Biome**（ESLint/Prettier は不使用）
- 機能は `web/src/features/<name>/`、共有は `web/src/shared/`
- アプリシェルは `features/shell/`。サイドバーの下地は
  `shared/ui/sidebar.tsx`（幅は CSS 変数 `--sidebar-width`、既定 300px は
  ドラッグのディテント。算術は `shared/ui/sidebar-width.ts` に純関数として分離）
- シェルが持つ状態（チャンネル一覧・既読カーソル・未読・スター）は
  `features/shell/shell-context.tsx` に集約する。`useReadState` は
  マウントごとに固有のスロット ID を持つため、**2 回インスタンス化してはならない**
- `React.memo` は all-or-nothing — 1 つでも参照不安定な prop（インライン関数、
  React Query の結果オブジェクト等）があると無効。安定メソッド
  （`mutation.mutateAsync`）に依存し、導出 Map/配列は
  `shared/hooks/useStableReference.ts` で内容等価キャッシュする
- ファイルサイズ上限あり（`check:file-sizes`）。公開鍵表示の短縮は
  `check:pubkey-truncation` が検査

### mobile

- **`StatefulWidget` 禁止**。状態は Riverpod、ローカルは `HookConsumerWidget` /
  `ConsumerWidget` + flutter_hooks
- 色・文字は `context.colors` / `context.textTheme`（テーマ拡張経由）。
  生 `Theme.of(context)` は避ける
- 1 ファイル 1 公開 widget。私的サブ widget は `part` で `<page>/` 配下へ。
  **上限 1000 行/ファイル**（`mobile/scripts/check-file-sizes.mjs` が強制。
  超えたら分割、上限変更や除外追加は不可）
- feature 間 import 禁止（`shared/` のみ可）
- `print()` 禁止（`debugPrint()` か構造化ログ）

### 共有物の同期

| 対象 | 同期方法 |
|---|---|
| イベント kind | Rust `kind.rs` が正。web は `check-kinds` ガードで機械検証。mobile（`nostr_models.dart`）は**手動同期 — ガード未整備** |
| 配色 | Catppuccin という共通参照はあるが、web CSS ↔ mobile Dart の機械検証は無し |

## 5. アイコン・アセット

- ロゴ/アプリアイコン: web は `@/assets/app-icon@3x.png`（`nuxxAppIcon` として
  invite / repos ページで使用）、mobile は `assets/images/nuxx-icon.png`
- ブランド表示名は **channels.nuxx.ai**（タイトル、NIP-11 のリレー名、
  ウェルカム画面、同意文言）

## 6. 新画面を作るときのチェックリスト

1. 色 → 既存トークンで表現できるか。できなければトークンを追加してから使う
2. 文字 → 標準 rem トークン。無ければ `tailwind.config.js` に命名追加
3. 間隔・角丸（mobile）→ Grid / Radii
4. ダーク → web は `.dark` 側の変数が揃っているか
5. `just web-check` / `just mobile-check` が通るか（ガード群が上記を機械強制）
