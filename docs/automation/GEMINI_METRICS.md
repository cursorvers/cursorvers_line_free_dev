# Gemini Metrics Pipeline

Gemini 要約ステップの挙動とコストをトラッキングするための仕組みです。  
`line-event.yml` が各実行で JSONL ログを `logs/metrics/gemini/<yyyymmdd>.jsonl` に追記し、夜間ジョブが集計してレポートを生成します。

## ドライバー構成

- 既定では `run-gemini-log-summary.mjs` が Generative Language API を直接呼び出します。
- `GEMINI_SUMMARY_DRIVER=cli` を指定すると Google 公式の `gemini` CLI を子プロセスとして実行し、同じ JSON 出力を取得します。
  - CLI 実行ファイルは `GEMINI_CLI_PATH`（デフォルト: `gemini`）で上書き可能。
  - CLI が設定を保存する作業ディレクトリは `GEMINI_CLI_WORKSPACE`（デフォルト: `<repo>/.gemini-cli`）。ホームディレクトリへ書き込みが必要ないため、Workspace 書き込み制限下でも利用できます。
  - CLI に渡す指示文を変えたい場合は `GEMINI_CLI_PROMPT` を設定します。
  - いずれのモードでも `GEMINI_API_KEY` は必須です。CLI 利用時も環境変数として渡してください。

## 生成フロー

1. `line-event.yml` 内の `Gemini Log Summary` ステップが `run-gemini-log-summary.mjs` を呼び出し  
   - ローカルログをサニタイズして Gemini API へ送信  
   - 応答のサマリーとメタ情報（latency, cost など）を `tmp/gemini/log-summary.json` に出力  
   - メトリクスレコードを日付別ファイル `logs/metrics/gemini/<yyyymmdd>.jsonl` に追記
2. 同ステップ後に `persist-progress` コンポジットで JSONL をコミット（push 失敗時は Artifact に退避）。
3. `Gemini Metrics Report` ワークフロー（`gemini-metrics-report.yml`）が毎日 02:00 UTC に実行され、  
   `report-gemini-metrics.mjs` で統計値（成功率、p95 latency、総コスト等）を算出し、JSON/Markdown として Artifact 化。Step Summary に結果を表示。

## 保存フォーマット

各 JSONL 行は以下のフィールドを含みます。

- `timestamp`: ISO8601 (UTC)
- `run_id`: GitHub Actions run と attempt の組み合わせ
- `status`: `ok` / `error` / `skipped_*`
- `logs_count`: 要約対象となったログ件数
- `latency_ms`, `duration_ms`: Gemini 応答レイテンシ / ステップ全体時間
- `cost_estimate`: 1 呼び出しあたりコストの推定値
- `model`: 使用した Gemini モデル名
- `anomalies_count`, `summary_length`: 解析結果のメタデータ

## 手動での集計コマンド

```bash
node scripts/automation/report-gemini-metrics.mjs \
  --input logs/metrics/gemini \
  --output tmp/gemini/metrics-summary.json \
  --markdown
cat tmp/gemini/metrics-summary.json.md
```

## 注意事項

- API キー未設定 / ログ無しの場合も JSONL に記録されます（`skipped_*` ステータス）。
- 長期保存したい場合は定期的に `.jsonl` をアーカイブし、不要になった日付ファイルを削除してください（削除も `persist-progress` で処理可能）。
- コスト推定は環境変数 `GEMINI_COST_PER_CALL` を元にしています。料金が変わった場合は `runtime-parameters.json` を更新してください。
