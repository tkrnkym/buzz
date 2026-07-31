# システム仕様

Nuxx はセルフホスト可能なチーム向けコミュニケーション基盤である。プロトコルの土台は
Nostr（署名付きイベント + リレー）で、その上にチャンネル・DM・git・エージェント・
ワークフローを載せている。

関連: [FEATURES.md](FEATURES.md) · [DATABASE.md](DATABASE.md) ·
[ARCHITECTURE.md](../ARCHITECTURE.md)

---

## 1. 全体構成

```
web (React/Vite) ─┐
mobile (Flutter) ─┼─ WebSocket + HTTP ─→ nuxx-relay ──→ Postgres（イベント永続化）
nuxx CLI         ─┤                        │      └───→ Redis（fan-out / presence / lease）
AI エージェント   ─┘                        │      └───→ S3/MinIO（メディア）
                                           └─ QUIC mesh（nuxx-relay-mesh、ポッド間 huddle 音声）
外部: push gateway（wake 信号のみ） / OIDC IdP（SSO、未完） / LLM API（エージェント利用時）
```

- リレーは単一バイナリ。web / admin の静的バンドルも同一プロセスから配信する。
- **原則: 新機能は HTTP エンドポイントではなく Nostr イベント（新 kind）として設計する。**
  HTTP は Blossom・webhook・git・NIP-11/NIP-05・ヘルスチェック・汎用ブリッジ
  （`/events` `/query` `/count`）に限る。

## 2. プロトコル

### 2.1 採用 NIP（標準）

NIP-01（基本イベント）/ NIP-05 / NIP-09（削除）/ NIP-10（スレッド）/
NIP-11（リレー情報）/ NIP-17（DM gift wrap）/ NIP-23（長文）/ NIP-29（グループ = チャンネル）/
NIP-33（parameterized replaceable, LWW）/ NIP-34（git）/ NIP-38（ステータス）/
NIP-42（WS 認証）/ NIP-44（暗号化）/ NIP-50（検索）/ NIP-65 / NIP-92（imeta）/
NIP-98（HTTP 認証）

### 2.2 独自 NIP（`docs/nips/`、14 本）

AA / AE / AM / AO（エージェント運用・観測）、AP、CW、DV、ER（リマインダ）、
GS、IA（アーカイブ）、OA（オーナー認可タグ）、PL（プッシュリース）、
RS（既読状態）、WP（ワークフロー）

### 2.3 kind レジストリ

**唯一の定義元は `crates/nuxx-core/src/kind.rs`（127 定義）。**
web は `web/src/shared/constants/kinds.ts`、mobile は
`lib/shared/relay/nostr_models.dart` に写し、CI ガード（`check-kinds`）が
Rust ↔ TS の一致を強制する。

主な独自帯（他 Nostr 製品との融合時は衝突確認が必須）:

| 帯 | 用途 |
|---|---|
| 39005–39007 | スレッド集計・ウィンドウ境界・アクティビティスナップショット |
| 40002–40008 | メッセージ v2・編集・ピン・ブックマーク・予約・リマインダ・diff |
| 40099–40100 | システムメッセージ・キャンバス |
| 40901–40902 | チャンネルサマリ・プレゼンススナップショット |
| 41001–41012 | DM ライフサイクル |
| 42000 | プロダクトフィードバック |
| 43001–43006 | エージェントジョブ |
| 44100–44200 | メンバー通知・エージェントターン計測 |
| 45001–45003 | フォーラム |
| 46001–46031 | ワークフロー実行・承認 |
| 48001–48106 | 監査・huddle |
| 49001 | メディアアップロード宣言 |

全リストは `kind.rs` を参照（本書には写しを置かない。二重管理を避ける）。

### 2.4 スコーピング規約

- チャンネル所属は **`h` タグ**（NIP-29）。`e` タグではない。
- リレーへのクエリは **`kinds` 指定必須**。省略すると p-gate により 403。
- `nuxx://message?channel=<uuid>&id=<hex>[&thread=<hex>]` がメッセージ深リンク。
  スキームは `nuxx` のみ（旧スキームの受理は削除済み）。

## 3. 認証・認可

| 経路 | 方式 |
|---|---|
| WebSocket | NIP-42 チャレンジ応答（kind:22242、**保存もログもしない**） |
| HTTP 書き込み | NIP-98（kind:27235 を Authorization に載せる） |
| メディア | Blossom 認可（kind:24242） |
| エージェント | NIP-OA オーナー認可タグ（`oa` = [owner_pk, conditions, owner_sig]） |
| メンバーシップ | `relay_members` + `pubkey_allowlist`、コミュニティ単位の ban |
| SSO（未完） | OIDC id_token 検証（JWKS）→ 決定論的鍵導出（保存しない）。セッション/署名 API と web UI が未実装 |

## 4. HTTP サーフェス

すべて host 由来のコミュニティ境界を保持する。

| 群 | パス |
|---|---|
| Nostr ブリッジ | `POST /events` · `POST /query` · `POST /count` |
| メタデータ | `/info`（NIP-11） · `/.well-known/nostr.json`（NIP-05） |
| 招待/ポリシー | `/api/invites{,/claim,/accept-policy}` · `/api/join-policy{,/terms,/privacy}` · `/invite/…` |
| メディア | `POST /media/upload` · `GET /media/{sha256_ext}` · `/upload` |
| git | `/repos/…`（smart HTTP + policy hooks） · `/repository` |
| 音声 | `/huddle/{channel_id}/audio`（WS） |
| ワークフロー | `POST /hooks/{id}`（webhook トリガ） |
| モデレーション | `/reports` · `/moderation/{audit,reports,restricted}` · `/feedback` |
| 運用者 | `/operator/communities{,/archive,/unarchive,/transfer,/availability}` |
| 管理 UI API | `/api/admin/v1`（`NUXX_ADMIN_HOST` 一致時のみ） |
| ヘルス | `/health` · `/_liveness` · `/_readiness` · `/_status` · `:9102/metrics` |

## 5. 主要な設定（環境変数）

綴りは `NUXX_*` のみ（旧 `BUZZ_*` 互換は削除済み）。

| 変数 | 意味 |
|---|---|
| `DATABASE_URL` / `READ_DATABASE_URL` | Postgres（後者は読み取りレプリカ、任意） |
| `REDIS_URL` | fan-out / presence / lease。複数レプリカ時は必須 |
| `NUXX_BIND_ADDR` / `NUXX_HEALTH_PORT` / `NUXX_METRICS_PORT` | 3000 / 8080 / 9102 |
| `NUXX_WEB_DIR` / `NUXX_ADMIN_WEB_DIR` / `NUXX_ADMIN_HOST` | 静的配信と管理 UI |
| `NUXX_S3_*` | メディアストレージ |
| `NUXX_PUSH_GATEWAY_DELIVERY_URL` | プッシュ配送先。**空文字で無効**。既定 `https://push.nuxx.ai/...`（ドメイン保有を確認のこと） |
| `NUXX_PAIRING_RELAY_URL` | 外部 NIP-AB リレーの公示（任意） |
| `NUXX_RELAY_PRIVATE_KEY` / `RELAY_OWNER_PUBKEY` | リレー署名鍵・オーナー |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | 未設定なら OTel は完全に no-op |
| （エージェント）`NUXX_RELAY_URL` `NUXX_PRIVATE_KEY` `NUXX_AUTH_TAG` `NUXX_ACP_*` `NUXX_AGENT_*` | ACP ハーネスが管理下プロセスへ注入 |

## 6. ワークフロー

- 定義は YAML（kind:30620 として保存）。条件式は [evalexpr]。
- トリガ: メッセージ / スケジュール（`cron` **または** `interval`、排他）/ webhook（`/hooks/{id}`）。
- 実行イベント列: 46001 triggered → 46002/46003/46004 step → 46005/46006/46007 終了。
- 人間承認: 46010 要求 → 46011 承認 / 46012 却下（`workflow_approvals` に永続化）。

## 7. 不変条件（変更時に壊してはならないもの）

1. **テナント境界**: `_operator_global_tables` 登録外の全テーブルは
   `NOT NULL community_id` を持ち、キー制約は community_id 先頭。
   マイグレーション lint（`nuxx-db`）と TLA+ conformance replay が強制する。
2. **適用済みマイグレーションは編集不可**（sqlx checksum。詳細は DATABASE.md）。
3. **kind 番号は変更不可**（署名済みイベントに焼き込まれる）。追加のみ。
4. **advisory lock ドメイン**（`nuxx_push_gate:` 等）は SQL と Rust 定数で一致必須。
   テストが両者を突き合わせる。
5. **AUTH イベント（22242）は保存・ログ禁止。**
6. 秘匿 kind（gift wrap 等）は FTS 索引から除外（`search_tsv` の CASE）。

## 8. 既知の未完・要対応（本書作成時点）

- カストディアルログインの後半（セッション/署名 API、web UI）
- モバイルのペアリング画面が削除済み desktop を前提にしている
- `git-sign-nostr` の BIP-340 全ゼロ鍵検証が効いていない（テスト 1 件が赤）
- `schema.sql` とマイグレーションの一致を検証するガードが無い
- 本番相当（Postgres/Redis あり）での e2e 実行はこの環境では未検証

[evalexpr]: https://docs.rs/evalexpr
