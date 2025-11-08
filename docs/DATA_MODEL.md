# Data Model – Cursorvers LINE Funnel

## Google Sheets: `line_members`
| 列名 | 型 | 説明 |
|------|----|------|
| user_hash | TEXT | HASH_SALT入り SHA-256 の先頭16桁。Supabase の `line_members.user_hash` と一致。|
| first_opt_in_at | ISO8601 | 友だち追加日時。|
| last_opt_in_at | ISO8601 | 最終アクティビティ（日付）。|
| status | TEXT | `lead` / `active` / `engaged` / `churned` など。|
| cta_tags | JSON文字列 | CTAタグ配列（`["cmd_detail", ...]`）。|
| last_message | TEXT | 直近のメッセージ内容（最大200文字）。|
| last_event_type | TEXT | 直近の LINE イベント種別。|
| raw_payload | JSON文字列 | 元イベントを JSON 文字列で保持。|

> **更新方法**: GitHub Actions (`line-event.yml`) から `scripts/vendor/google/upsert-line-member.js` を呼び、Service Account (Secrets) 経由で書き込み。Supabase 側が真実のソースで、Sheets は Ops 可視化のレプリカ。

## Supabase: `line_members`
- 目的: LINE ユーザーのタグ・プロモーション状態を正規化して保存。`user-state.mjs` が読書きする一次データベース。
- 主なカラム:
  - `user_hash` (PK, text)
  - `first_opt_in_at` / `last_opt_in_at` (timestamptz)
  - `status` (text, default `lead`)
  - `cta_tags` (text[])
  - `metadata` (jsonb) – `broadcast_month_key`, `broadcast_count_month`, `promo_last_sent_at` 等を格納
  - `consent_guardrail`, `guardrail_sent_at`
  - `created_at`, `updated_at`
- スキーマ: `supabase/migrations/20251105071000_align_line_members.sql`

## Supabase: `progress_events`
- 目的: GitHub Actions/Manusの進捗イベントを永続化し、監査・可視化に利用。
- スキーマ: `database/migrations/0001_init_tables.sql` を参照。
- 典型データ:
  ```json
  {
    "task_id": "task-123",
    "event_type": "step_succeeded",
    "step_id": "s1",
    "status": "success",
    "payload": {"latency_ms": 1200},
    "created_at": "2025-11-01T12:34:56Z"
  }
  ```

## Supabase: `budget_snapshots`
- 目的: `economic-circuit-breaker.yml` の実行結果を保存し、予算推移を可視化。
- スキーマ: `database/migrations/0001_init_tables.sql`。
- 典型データ:
  ```json
  {
    "total_cost": 42.50,
    "budget_usd": 50.0,
    "consumption_rate": 0.85,
    "status": "WARNING",
    "captured_at": "2025-11-01T13:00:00Z"
  }
  ```

## 将来拡張
- `conversion_events` テーブルを追加し、40%有料化指標をSupabaseで直接集計。
- SheetsからSupabaseへの定期同期（GitHub Actions cron）を検討。 |
## Supabase: `event_logs`
- 目的: LINE 返信や Spec 評価の結果を JSONL として保存し、障害時に追跡可能にする。
- スキーマ: `supabase/migrations/20251108_create_event_logs_note_webhooks.sql`
- 主なカラム: `log_type`, `event_id`, `user_hash`, `payload` (jsonb), `created_at`。

## Supabase: `note_webhooks`
- 目的: note から受信した `viewed_note` / `payment_completed` などの Webhook payload を署名付きで保存し、再処理・重複排除に利用。
- 主なカラム: `note_event_id` (unique), `event_type`, `note_user_id`, `user_hash`, `payload`, `status`, `dedupe_key`, `received_at`, `processed_at`, `last_error`。
- スキーマ: `supabase/migrations/20251108_create_event_logs_note_webhooks.sql`
