# Line Actions Orchestration – Design

## 1. Architecture Overview

### 1.1 System Boundaries & Data Flow
```
note (UTM付与リンク / Webhook)
      │ viewed_note
      ▼
GitHub repository_dispatch (note → line-automation)
      │
      ▼
LINE Messaging API (友だち追加・テキストコマンド)
      │ add_line / cmd_* / unsubscribe / resubscribe
      ▼
functions/relay (Deno Edge)
      │ 署名検証・重複排除
      ▼
GitHub Actions
  • line-event.yml
      - Spec Router (codex.spec.yaml)
      - 配信ルール適用
      - Supabase / Google Sheets へのログ
      - Verified domain / PHI フィルタ
      - Discord 依頼 (cmd_start_course)
      - Artifact 退避
  • manus-progress.yml
      - Manus API 結果処理（縮退モード継続）
  • gemini-metrics-report.yml
      - 日次メトリクス集計
  • ci-smoke-act.yml / validation run
      - テスト/CI
  • オプション: note-webhook.yml (新規)

外部サービス
  - LINE Messaging API (Webhook + Reply API)
  - note API / Webhook (viewed_note, payment_completed)
  - Discord API (個人ログ作成、教材送付)
  - Supabase (JSONL ログ)
  - Google Sheets (lead ledger)
```

### 1.2 Spec-Driven Orchestration
- `codex.spec.yaml` にイベントとルールを定義。`line-event.yml` が最初に spec を読み込み、イベント名/タグ/フィルタ/アクションを実行。
- 既存の `scripts/webhook-router.mjs`／`scripts/lib/feature-flags.js` を拡張し、Spec に基づくルール評価を行う Node スクリプトを新設（例: `scripts/orchestration/execute-rules.mjs`）。
- ルール実行内容（送信メッセージ、タグ操作、API 呼び出し）を JSON Schema で管理し、CI で lint→validate 可能にする。

## 2. Detailed Approach

### 2.1 Spec Loader & Router
- 新規 `codex.spec.yaml` に以下を定義：
  - `globals`: フッター文言、verified domain 設定、promo cooldown、broadcast 上限等。
  - `events`: 受け付けるイベント ID 一覧。
  - `rules`: `when` / `if` / `do` / `limits` を記述。`do` のアクションは `send_message`, `tag:add/remove`, `metric:emit`, `action:create_discord_private_log`, `action:push_material`, `action:pause_broadcasts`, `action:resume_broadcasts` を想定。
  - `constraints`: `promotion`, `content.phi_filter`, `logging`。
- `scripts/orchestration/load-spec.mjs` で YAML を読み込み JSON Schema (`schemas/codex-spec.schema.json`) による検証を行い、Action 内で `spec` オブジェクトとして使える形に変換。
- `line-event.yml` は Step 1 で spec を読み、Step 2 でイベント payload（LINE Text/note Webhook）を spec Router に渡す。

### 2.2 Event Sources
- LINE Text: Deno relay で `cmd_*`／`#` コマンドを抽出し `repository_dispatch` に `event=<command>` を設定。
- LINE Add Friend: event `add_line` を既存フローで発火。
- note Webhook（新規）:
  - `viewed_note`: note 側で UTM パラメータ経由のビューを Webhook または BigQuery export で受信。初期は遅延リストでも可。payload: `{ note_user_id, article_id, utm_campaign, ts }`。
  - `payment_completed`: note 有料コンテンツ決済 Webhook。payload: `{ note_user_id, plan_id, amount, ts, line_user_id? }`
  - note Webhook Handler (`.github/workflows/note-event.yml`) を追加し、payload を Supabase に保管しつつ `line-event.yml` に転送。

### 2.3 Tag Management
- Supabase JSONL と Google Sheets 両方にタグ情報を保存し、`line-event.yml` 実行時に `current_tags` をフック。
- `scripts/orchestration/user-state.mjs` を実装し、タグの取得/更新を共通化。Sheets への同期はバッチ更新、Supabase への書き込みは逐次。
- Tag operations: Spec の `tag:add/remove` から `user-state` モジュールを呼び出す。

### 2.4 Message Delivery & Constraints
- Verified Domain: spec `globals.require_verified_domain` が true の場合、送信前に `link` を認証済みリストと照合 (`scripts/orchestration/verified-links.mjs`)。失敗時は Action step 中断。
- PHI Filter: 受信テキストを `content.phi_filter.patterns` で検査し、ヒットした場合 `delete_incoming`＋警告メッセージ送信、Supabase にエントリー（V8）。
- Broadcast Limit: `max_broadcast_per_user_per_month` で送信ログを集計。Redis など追加せず Supabase の `logs` テーブルで集計→Action step で抑制。CI テストでケース V11 を再現。
- Promo Cooldown: `conversion_invited` タグ付与時に Supabase に `promo_last_sent_at` を記録して 30 日クールダウンを enforce。

### 2.5 Discord Integration
- 新規 `scripts/discord/client.mjs` を実装（fetch ベース、Retries/RateLimit 2xx)。
- `create_discord_private_log` アクション: API `POST /log`（仮）に `line_user_id`, `note_user_id` を送信し、個人チャネルが作成される。
- `push_material` アクション: `template_id` から教材ファイルを取得し Discord DM へ送信。`attach_self_assessment` true の場合 Google Forms 等のリンクを付与。
- 失敗時: `action` ステップでリトライ 3 回→失敗で degraded モード通知（Ops に Issue と Slack 送信）。

### 2.6 Logging & Artifact
- Supabase JSONL: イベントごとに `event`, `user_id`, `tags_before`, `tags_after`, `actions_executed`, `promotion_sent`, `phi_detected` などを記録。LINE返信結果は `scripts/orchestration/log-writer.mjs` 経由で `event_logs` に送信。
- GitHub Artifact: 既存 `persist-progress` を利用し `logs/orchestration/<timestamp>.json` や `tmp/orchestration/reply-log.json` を退避。
- モニタリング: `gemini-metrics-report.yml` を継続。必要なら `line-orchestration-metrics.yml` を追加し、タグ遷移・promo 制御などを日次集計。

## 3. Testing Strategy

1. **Schema Validation**: `npm run lint:spec` を新設し、`codex.spec.yaml` を JSON Schema で検証。
2. **Unit Tests (Node)**
   - `scripts/orchestration/execute-rules.test.mjs`: V1–V12 の入力/期待出力をモックしハンドラが適切にアクションを返すか検証。
   - `phi-filter.test.mjs`: パターンヒット時の `delete_incoming` と警告メッセージを検証。
   - `verified-links.test.mjs`: 非認証ドメインが拒否されるか確認。
3. **Integration Tests**
   - `ci-smoke-act.yml` を拡張し、`line-event.yml` を `act` で乾式実行（payload fixture: add_line, cmd_done, etc）。
   - note Webhook 用の `act` テスト (optional)。
4. **CI Workflow**
   - `node-tests.yml`: `npm test`, `npm run test:actions`, `npm run lint:spec`, `npm run runtime:verify`, `npm run workflows:check`。
   - `validation.yml`: V1–V12 のテーブル駆動テストを `node --test` で実行し、必要に応じて YAML ベースのケースをパース。

## 4. Risks & Mitigations

| リスク | 説明 | 対策 |
| --- | --- | --- |
| Discord API 仕様不明 | ログ作成/教材送付 API のレート制限や認証方式が未確定 | API 担当者と仕様確認、開発環境で `queue` + リトライ実装。失敗時に Ops へ通知するフェールセーフを設ける |
| note Webhook 信頼性 | Webhook 遅延や重複配信が起きる可能性 | Supabase に idempotency キーを保存し、`viewed_note` データは集計まとめて処理するバッチを別途検討 |
| タグの整合性 | Google Sheets / Supabase / LINE が同期ずれする | 中央の user-state モジュールを単一ソースにし、同期失敗時は再実行／Slack 通知 |
| Verified Domain メンテ | 認証済みドメインの管理が属人化 | `.env.verified-domains.json` を管理し、CI で PR ごとにチェック |
| PHI 誤検知 | 正規のメッセージがブロックされる可能性 | pattern list を Ops とレビュー、ヒット時の通知で誤検知を報告できるようにする |
| Broadcast 上限計測 | Supabase 集計が重くなる可能性 | バッチ用の materialized view を用意 or BigQuery Export を検討。初期は Supabase で日次集計し、負荷が高い場合にアップグレード |
| 既存ユーザー移行 | 既存 `lead` のタグ初期化が必要 | 移行スクリプトを `scripts/orchestration/migrate-tags.mjs` として提供し、Prod 実行手順を Runbook に追記 |

## 5. Deployment / Migration Plan
1. `codex.spec.yaml` と JSON Schema を追加し CI パイプラインに組み込む。
2. `scripts/orchestration/*` モジュール群を実装し、line-event.yml を Spec ドリブンに切り替え。
3. note Webhook ハンドラー（Actions or Supabase edge）を実装し、payload を確定。
4. Discord API 認証情報（`DISCORD_API_TOKEN`, `DISCORD_GUILD_ID` など）を Secrets に追加し、runtime registry (`config/workflows/runtime-parameters.json`) を更新。
5. 既存タグ／ユーザーデータのマイグレーションスクリプトを実行。
6. `ci-smoke-act.yml` を更新し、主要イベントをフィクスチャで検証。
7. Rollout: ベータ環境（`DEVELOPMENT_MODE=true`）で数日様子見 → デグレード/最終フラグ ON。
8. Ops Runbook を更新し、コマンド体系・タグ運用・Discord フローを反映。

## 6. Open Questions
- note Webhook payload と再試行ポリシーは最終確認が必要。暫定 JSON を `schemas` に置き PR で更新する。
- Discord API の実際のエンドポイントと権限設定は別途チームと擦り合わせ。
- テストランナー: Node (`node --test`) 中心で進める予定だが、YAML ベースの spec に対する lint との統合どうするか（`spectral` など）を検討。
- `max_broadcast_per_user_per_month` の対象に販促を含めるか? 仕様で 2 通/定常のみと補足必要。

---
この設計に合意が得られたら `/sdd-tasks` に進みます。
