# Line Actions Orchestration – Requirements

## Problem Summary
LINE を合図・通知チャネル、Discord を学習本体、note を決済口として連携させる新しい学習導線を整備する。LINE では行動コマンド（#詳しく/#参加/#完了/#受講開始/#つまずき/#規約/#通知停止/#再開）に応じてタグを管理し、必要なときだけ販促を発火させる。note Webhook や LINE Text イベントから GitHub Actions で配信ルールを駆動し、Supabase/Discord 連携を自動化する。ユーザーが求める情報を即座に返しつつ、paid_active には販促ゼロ、医療安全ガードレール徹底、PHI 検出ブロックなど安全面も維持したい。

## Acceptance Criteria
- [ ] **イベント定義**: 以下のイベント payload を受け取るとシステムが認識できる（`viewed_note`, `add_line`, `cmd_detail`, `cmd_participate`, `cmd_done`, `payment_completed`, `cmd_start_course`, `cmd_stuck`, `cmd_regulation`, `unsubscribe`, `resubscribe`）。マッピング仕様が codex.spec.yaml に反映される。
- [ ] **タグ管理**: `lead_free`, `trial_active`, `paid_active`, `alumni`, `conversion_invited` の付与/削除が各ルールで正しく行われる。既存タグは上書きせず追加・保持。
- [ ] **ウェルカムメッセージ制御**: `add_line` の初回のみ `welcome_message` を送信し、2回目以降は抑制 (V1)。
- [ ] **案内コマンド応答**: `cmd_detail` で 1ページ案内テンプレを返信し、ガードレールフッターを付与 (V2)。
- [ ] **スケジュール表示**: `cmd_participate` かつ `paid_active` でない場合、次回日程と note URL を返し、`trial_active` を付与、メトリクス `viewed_schedule` を記録 (V3)。
- [ ] **販促トリガー**: `cmd_done` から `conversion_invited` 未付与のユーザーにのみ販促を 1回送信し、タグ `conversion_invited` を付与。30日以内は再送しない (V4, V5)。
- [ ] **販促抑止**: `paid_active` タグ保持者に対しては販促テンプレを一切送信しない (V6, V12)。
- [ ] **決済完了処理**: `payment_completed` を受けると `paid_active` を付与し、受講開始案内を送信 (V6)。
- [ ] **Discord 連携**: `cmd_start_course` 受信時、`paid_active` のユーザーに対して Discord 個人ログ作成 API を呼び出し 200 を取得、教材テンプレと自己採点フォーム送信を実施 (V7)。
- [ ] **FAQ 誘導/規約再提示**: `cmd_stuck` で FAQ リンク、`cmd_regulation` でグローバルフッターを送信 (V8 部分含む)。
- [ ] **解除/再開**: `unsubscribe` でブロードキャスト停止、`resubscribe` で再開し、通知再開メッセージを送信 (V9)。
- [ ] **Verified Domain**: すべてのリンクが検証済みドメインのみを利用し、未検証 URL 送信時はビルドまたは送信でブロック (V10)。
- [ ] **配信上限制御**: 月 2 通を超える定常ブロードキャストが自動で抑制される (V11)。
- [ ] **PHI フィルタ**: テキストに氏名/住所/保険者番号などが含まれる場合、投稿を削除し警告テンプレを送信、ログに記録 (V8)。
- [ ] **ログ保全**: すべてのイベントで Supabase への JSONL 記録と GitHub Artifact 退避が成功し、欠損しない。
- [ ] **CI バリデーション**: Validation Cases V1–V12 の自動テストが CI で実行され、失敗時はビルドが停止。どのテストランナーを使うか決定しドキュメント化。

## Constraints & Dependencies
- 外部サービス: LINE Messaging API、note (UTM 付き URL / Webhook)、Discord API、Supabase、Google Sheets。
- 配信フッターに医療安全ガードレールを共通適用 (`globals.footer_text`)。PHI フィルタリング必須。
- `require_verified_domain=true` で運用し、検証済みドメイン一覧を管理する必要がある。
- Secrets / Variables: `MANUS_API_KEY`, `MANUS_BASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID`, `DISCORD_API_TOKEN` (新規), `VERIFIED_NOTE_URL`, `VERIFIED_FAQ_URL` などを見直す。
- Feature flags: `MANUS_ENABLED`, `DEGRADED_MODE`, `DEVELOPMENT_MODE` を活用した縮退運用を継続。
- Rollout: 既存 LINE ユーザーに対する移行計画とタグリセット手順が必要。note Webhook の導入時期に合わせて環境切り替え。
- 既知の制約: Discord API の呼び出しレート／失敗時リトライ戦略が未定。note Webhook payload の確定スキーマが未入手。

## Open Questions / Follow-ups
- KPI: note→LINE 転換率、`trial_active`→`paid_active` の改善目標、月間送信上限遵守の計測方法を確定する必要がある。
- note Webhook の配信タイミング・再試行ポリシーは？ `viewed_note` の正確な検知方法（UTM 以外のトラッキング）が未決定。
- Discord 個人ログ作成 API のエンドポイント、必要な権限、失敗時のリカバリについて詳細仕様が未定。
- `max_broadcast_per_user_per_month` = 2 のカウント方法（販促配信を除外するか等）を決める必要。
- Validation テストをどのランナー（Node、YAML、ActionLint 等）で実装するか要決定。
- 既存ユーザーデータへのタグ初期化 (マイグレーション) 方針と、`conversion_invited` のリセット条件。
