# DB 設計

Postgres 単一データベース。**唯一の真実は `migrations/`（0001 統合スキーマ + 増分、
計 31 本）**で、リレー起動時に sqlx が自動適用する。`schema/schema.sql` は適用後の
姿のダンプ（参照用）。push gateway は別データベース前提で、独自の
`crates/nuxx-push-gateway/migrations/` を持つ。

関連: [SPECIFICATION.md](SPECIFICATION.md) · [multi-tenant-conformance.md](multi-tenant-conformance.md)

---

## 1. 設計原則

### 1.1 マルチテナントが第一級

- 全テーブルは **`community_id UUID NOT NULL`** を先頭に持つ。
  例外は `_operator_global_tables` に理由付きで登録されたものだけ
  （`communities` 自身、`replica_heartbeat` など）。
- 主キー・UNIQUE・FK は **community_id を先頭列**に置く。
- この規約は好みではなく機械が強制する:
  - `nuxx-db` のマイグレーション lint（未スコープのテーブル/制約で CI が落ちる）
  - TLA+ 仕様 `docs/spec/MultiTenantRelay.tla` + `nuxx-conformance` の
    トレース replay（実行時の受理/拒否が仕様に一致するか）

### 1.2 適用済みマイグレーションは不変

sqlx は適用済み各マイグレーションの checksum を `_sqlx_migrations` と照合し、
不一致なら `VersionMismatch` で**リレーが起動しない**。過去ファイルの編集は禁止。
訂正は常に新しいマイグレーションで行う（例: 0029 のロックドメイン改名、
0031 の CHECK 拡張）。

### 1.3 イベントソーシング寄りの二層

署名付き Nostr イベント（`events`）が一次データ。リレーはそこから読み取り用の
実体化テーブル（`channels` `users` `thread_metadata` `reactions` …）を導出する。
**導出側を直接いじる修正は不整合の元**。必ずイベント経由で書く。

## 2. 中核テーブル

### events（パーティション親）

```sql
CREATE TABLE events (
    community_id UUID NOT NULL REFERENCES communities(id),
    id           BYTEA NOT NULL,          -- 32B イベント ID
    pubkey       BYTEA NOT NULL,          -- 32B 投稿者
    created_at   TIMESTAMPTZ NOT NULL,
    kind         INT NOT NULL,
    tags         JSONB NOT NULL,
    content      TEXT NOT NULL,
    search_tsv   TSVECTOR GENERATED …,    -- NIP-50 用。秘匿 kind は NULL（索引除外）
    sig          BYTEA NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    channel_id   UUID,                    -- NULL = チャンネル外（DM ラッパ等）
    deleted_at   TIMESTAMPTZ,             -- ソフト削除（NIP-09）
    d_tag        TEXT,                    -- NIP-33 の d タグ（LWW キー）
    not_before   BIGINT,                  -- 予約送信
    delivered_at BIGINT,
    PRIMARY KEY (community_id, created_at, id)
) PARTITION BY RANGE (created_at);
```

- **`created_at` で RANGE パーティション**（`events_p` + past/future）。
  トリガや削除文の `created_at = NEW.created_at` は
  パーティション枝刈りのためにある。消してはならない。
- `search_tsv` は生成列（STORED）。サイドカー索引なし。
  kind 1059/30300/30350/30622/44100/44101/44200 は NULL（検索に出ない）。

### events に付くトリガ（正しさの根拠がここに集約）

| トリガ | 役割 | 同期の要 |
|---|---|---|
| `events_enqueue_push_match` | プッシュ対象 kind を `push_match_queue` へ | `nuxx_push_gate:` advisory lock を **SHARED** で取得。リース有効化側（Rust）が同じキーを **EXCLUSIVE** で取り、lost-wake を全順序で排除 |
| `events_refresh_channel_ttl` | エフェメラルチャンネルの TTL 延長（deferred） | `nuxx_channel_ttl:` を SHARED。TTL 変更側が EXCLUSIVE。stale-NULL 穴を閉じる |
| `events_created_at_floor` | レプリカフェンス（GUC `nuxx.created_at_floor`、旧名も COALESCE で読む） | 過去時刻の割り込み挿入を拒否し、キーセットページングの安定性を守る |
| `trg_events_purge_soft_deleted_nuxx_mesh_status` | mesh status（45 秒心拍）の物理削除 | ソフト削除された 30003 を即時 purge |

⚠️ advisory lock のドメイン文字列は **SQL とRust 定数
（`PUSH_GATE_LOCK_NAMESPACE` / `CHANNEL_TTL_LOCK_NAMESPACE`）の一致が生命線**。
文字列が違えばハッシュが違い、衝突しなくなり、証明が静かに崩れる。
`migration.rs` のテストが両者を突き合わせている。

### 実体化・参照テーブル

| テーブル | 内容 |
|---|---|
| `communities` | テナント。`host` が境界キー。`signing_key`、archive |
| `channels` | 名称・type（stream 等）・visibility・topic・canvas・TTL（`ttl_seconds`/`ttl_deadline`）・NIP-29 group id。`community_id` 不変トリガ付き |
| `channel_members` | チャンネル所属・ロール |
| `users` | プロフィール写像 + エージェント属性（`agent_type` `capabilities`） |
| `relay_members` / `pubkey_allowlist` / `community_bans` | 入場管理 |
| `thread_metadata` | `reply_count` / `descendant_count` の実体化。**返信を挿入する全経路が更新義務を負う** |
| `reactions` | リアクション集計 |
| `event_mentions` | メンション逆引き（通知・アクティビティ） |
| `subscriptions` | ライブ REQ の写し（fan-out 用） |

### プッシュ通知系

`push_leases`（端末リース、NIP-PL kind:30350 の写像）→
`push_match_queue`（トリガが投入）→ `push_wake_outbox`（配送待ち）→
gateway へ HTTP POST（本文なしの wake 信号）。
gateway 側 DB: `push_gateway_installations`（`app_profile` CHECK は
新旧両綴りを許可 = 0031）、challenges / delegations / replay 防止 ×2 / quotas。

### ワークフロー系

`workflows`（定義）/ `workflow_runs`（実行）/ `workflow_approvals`（承認）/
`scheduled_workflow_fires`（cron/interval の発火予定）。

### 監査・モデレーション・運用

`audit_log`（**ハッシュチェーン**。community 単位に `nuxx_audit:` advisory lock で
直列化）/ `moderation_reports` / `moderation_actions` /
`rate_limit_violations` / `delivery_log`（RANGE パーティション、配送記録）/
`api_tokens` / `relay_invites` / `join_policy_acceptances` /
`archived_identities` / `replica_heartbeat`（単一行、レプリカフェンスの心拍）。

## 3. マイグレーション運用

```
migrations/0001_initial_schema.sql   ← 統合済み初期スキーマ
migrations/0002 … 0031               ← 増分
```

- 追加時は `crates/nuxx-db/src/migration.rs` の **件数アサーション
  （現在 31）と内容アサーションを必ず更新**する。lint がテーブルのテナント
  スコープを検査する。
- 現在 0027 / 0029 / 0030 / 0031 の 4 本は旧名（buzz）互換のためだけに存在する。
  適用済み Postgres が存在しない今なら、全体を新 0001 に再統合して消せる
  （実施は Postgres で起動検証できる環境で行うこと）。
- `schema.sql` は手動同期。**自動検証ガードが未整備**（既知の課題）。

## 4. スケーリング前提

- 読み取りレプリカ: `READ_DATABASE_URL`（writer/reader プール分離）
- 複数リレーレプリカ: Redis 必須（fan-out）、huddle は Redis fenced CAS lease で
  ポッド所有、ポッド間は QUIC メッシュ
- レプリカフェンス: GUC + `events_created_at_floor` トリガ + `replica_heartbeat`
