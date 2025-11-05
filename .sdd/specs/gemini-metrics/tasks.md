# Tasks – Gemini Log Metrics Instrumentation

| # | タイトル / 目的 | オーナー | 優先度 | 主要ファイル | Done 条件 & テスト | 依存関係 | 並行実行 |
|---|----------------|----------|--------|--------------|-----------------------|------------|------------|
| GM1 | Geminiサマライザースクリプトの計測拡張（latency/cost付与） | DevOps | P0 | `scripts/automation/run-gemini-log-summary.mjs`, `tests/node/gemini-log-summary.test.mjs` | API呼び出し前後で時間計測・`cost_estimate` 算出、結果JSONへ反映。ユニットテストで新フィールドを検証 | 既存PoC実装 | 可 |
| GM2 | workflow内メトリクス収集・Artifact化 | DevOps | P0 | `.github/workflows/line-event.yml`, `scripts/verify-secrets.sh`, `config/workflows/required-secrets.json` | Step Summaryに status/duration/cost 追記、`tmp/gemini/metrics.jsonl` へ追記、`gemini-metrics` Artifact を追加。手動dry-runで出力確認 | GM1 | 不可 |
| GM3 | メトリクス集計CLIの実装とテスト | DevOps/Analytics | P1 | `scripts/automation/report-gemini-metrics.mjs`, `tests/node/report-gemini-metrics.test.mjs` | JSONL入力を集計し統計JSON/Markdownを出力。ユニットテストで合計・平均計算を検証 | GM2（生成ファイル仕様） | 可 |
| GM4 | ドキュメント更新（PoCレポート/運用メモ） | Ops Enablement | P1 | `docs/automation/GEMINI_POC_REPORT.md`, `.sdd/steering/tech.md` 等 | 集計CLIの使い方と評価指標記入フローを追記し、ステアリングにメトリクス把握手順を明記 | GM3 | 可 |

**Blockers / 留意点**
- `GEMINI_COST_PER_CALL` GitHub Variable を定義（デフォルト 0.002 USD/リクエストなど）。未設定時の扱いを設計（警告 or デフォルト値）。
- Artifact 保持期間をOpsと合意し、PoC終了時の削除手順を決める。
- ネットワーク遅延が大きい場合、bash 計測と Node 計測の差分をどう扱うか（ドキュメント化）。
