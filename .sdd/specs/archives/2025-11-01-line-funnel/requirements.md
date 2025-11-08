# Cursorvers LINE Funnel – Requirements

## Problem Summary
- 医療AI導入監査コンサルティング「Cursorvers」における note 記事（https://note.com/nice_wren7963）から LINE への流入後、登録者の 40% を有料サービスへ誘導する自動化を確立したい。
- 現状は Front Door → GitHub Actions → Manus という設計書ベースの運用だが、Plan JSON / PlanDelta の扱いやログ・ハッシュ処理などに未整備のポイントがあり、本番運用の信頼性・監査性・セキュリティが十分ではない。
- 仕様駆動開発 (Specification-Driven Development) を徹底し、GitHub Actions で Plan を凍結・検証しながら LINE イベント処理と進捗管理を自律運転させることが目的。

## Desired Outcome
- note 経由で友だち追加した LINE 利用者が、セグメントされた配信やイベント告知を受け、40% 程度が有料コンサルティングへ転換できる運用を実現する。
- Front Door の署名検証と個人情報サニタイズが強化され、GitHub Actions が Plan JSON を唯一の真実として実行し、Manus は開発／最終段階のみで補助的に動作する。
- GitHub Actions ダッシュボード (https://github.com/mo666-med/cursorvers_line_free_dev/actions) から全ワークフローの状態を監査でき、予算や安全ガードレールを常に遵守できる。

## Acceptance Criteria
- [x] **LINE Webhook 処理**: Front Door が LINE の HMAC 署名を検証し、ユーザー ID を塩付き SHA-256 でマスクした上で GitHub `repository_dispatch` を発火する。署名不正時は 403 を返却しログに記録する。
- [ ] **Manus Progress 取り込み**: Manus からの Bearer トークンをタイミングセーフ比較で検証し、ProgressEvent v1.1 の必要項目を欠損なく GitHub Actions へ渡す。（署名検証は実装、再実行制御は未完）
- [x] **Plan JSON 運用**: `line-event.yml` が開発モードでは PlanDelta を生成・記録し、production モードでは `orchestration/plan/production/current_plan.json` のみを実行する。Plan 変更時は GitHub PR でレビュー必須。
- [ ] **PlanDelta 処理**: `manus-progress.yml` が PlanDelta を解析し、`decision: retry` / `decision: amended` の場合にのみ Manus API 再呼び出しや後続ワークフローを起動する。（判定は実装、API再呼び出しは未接続）
- [ ] **Conversion Tracking**: Supabase または Google Sheets に登録者メタデータと有料転換フラグを保存し、週次で GitHub Actions が 40% 目標に対する KPI レポートを生成する。（Sheetsアップサート/週次ワークフローは用意、実運用データは未投入）
- [ ] **予算ガードレール**: `economic-circuit-breaker.yml` が `BUDGET.yml` の閾値を監視し、80% で警告、150% で Manus 連携を停止し LINE + ICS 代替ルートへ自動切替する。（しきい値ロジックとGH Issue連携のみ準備、実コスト取得と代替ルート切替は未完）
- [ ] **監査ログ**: すべての ProgressEvent と Plan 差分が `logs/progress/` に JSON で保存され、Git コミットとダッシュボードから追跡できる。（GitHub Actions 連携は実装済み、運用実績は未確認）
- [ ] **テレメトリと通知**: 主要ワークフロー完了時に GitHub Actions が成功/失敗をステークホルダーへ通知し、失敗時は Runbook に従った復旧ステップが提示される。（GitHub通知テンプレートは未整備）

## Constraints & Dependencies
- **外部サービス**: LINE Messaging API、Supabase Edge Functions、Supabase データベース（もしくはGoogle Sheets）、GitHub Actions、Manus API。
- **環境/Secrets**: GitHub Actions に `LINE_CHANNEL_SECRET`, `MANUS_API_KEY`, `LLM_ENDPOINT`, `LLM_API_KEY`, `PROGRESS_WEBHOOK_URL` などが既に登録済み。Front Door には `HASH_SALT` を追加要。
- **Feature Flags**: `FEATURE_BOT_ENABLED` による Kill-Switch、`vars.DEVELOPMENT_MODE`, `vars.MANUS_ENABLED`。
- **ロールアウト**: 開発モードで PlanDelta / Manus 経路を検証後、production モードで凍結された Plan JSON を配布。移行中は緊急停止手順 (Supabase secret) を常備。
- **制約**: 医療安全ガードレール文言の常時付与、PHI の記録禁止。LINE ID はハッシュ化・短縮のみ保存。GitHub Actions の並列実行制御が必要。

## Open Questions
- KPI レポートの正式な指標（LINE 登録→有料転換の定義、期間、責任者）は誰がどこで管理するか。
- Google Sheets と Supabase の役割分担（短期は Sheets、長期は Supabase?）とアクセス権限ポリシーの詳細。
- Plan JSON 変更フローの承認者や CODEOWNERS、レビュー テンプレートはどう設計するか。
- 予算超過時の LINE + ICS 代替ルートの具体的な手段（送信内容・頻度・責任者）。
- 既存の `.claude` エージェント群や Miyabi スクリプトを今後どこまで自動運用に組み込むか。

## Follow-up Tasks
- KPI・配信セグメント・データ保持ポリシーについてステークホルダー合意を取得する。
- Supabase / Sheets スキーマとマイグレーションを定義し、ステージングで検証する。
- `line-event.yml` / `manus-progress.yml` の Plan 処理ロジックを実装し、GitHub Actions 上で dry-run テストを行う。
- Front Door のユニットテストを Deno 環境で実行できるよう CI に Deno セットアップを追加する。
- `economic-circuit-breaker.yml` の閾値テストと縮退ルート文書化を実施する。
- Notification (Slack/Email/GitHub) の宛先と Runbook のアップデートを完了させ、ステークホルダーサインオフを得る。
