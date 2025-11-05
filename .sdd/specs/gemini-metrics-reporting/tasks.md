# Tasks – Gemini Metrics Weekly Reporting

| # | タスク / 目的 | 優先度 | 主要ファイル | 完了条件 & テスト | 依存関係 |
|---|----------------|--------|--------------|-------------------|------------|
| GR1 | 週次集計用ラッパースクリプト実装（フィルタ＋Markdown出力） | P0 | `scripts/automation/prepare-gemini-weekly-report.mjs`, `tests/node/prepare-gemini-weekly-report.test.mjs`, `tests/fixtures/gemini-metrics-weekly/**` | 日付範囲のフィルタリング、しきい値警告、JSON/Markdown生成がユニットテストで検証できる | 既存集計CLI (`report-gemini-metrics.mjs`) |
| GR2 | GitHub Actions 週次ワークフロー構築・Slack連携 | P0 | `.github/workflows/gemini-weekly-report.yml` | cron/dispatch対応、Step Summary 表示、Slack通知（シークレット有無両ケース）、Artifact `gemini-weekly-report` アップロードを dry-run で確認 | GR1 |
| GR3 | ドキュメント更新（PoCレポート、ステアリング） | P1 | `docs/automation/GEMINI_POC_REPORT.md`, `.sdd/steering/tech.md` | 週次レポート参照方法、Slack連絡フロー、設定パラメータを追記 | GR2 |

**Blockers / 注意点**
- `SLACK_WEBHOOK_GEMINI` シークレットと Artifact 保持期間（>=7日）を事前に調整する。
- 期間フィルタの基準を UTC で統一し、JSTとのズレを Runbook に記載する。
