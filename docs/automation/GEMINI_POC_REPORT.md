# Gemini 補完 PoC レポート

> このドキュメントは GitHub Actions 内での Gemini 活用 PoC 結果を整理するテンプレートです。実施後に数値・所感を追記してください。

## 1. 実施サマリー
- 期間: YYYY-MM-DD 〜 YYYY-MM-DD
- トリガー対象ワークフロー: `.github/workflows/line-event.yml`
- 分析対象ログ: `logs/progress/*.json`（最大 50 件）
- 出力物: `tmp/gemini/log-summary.json`（Artifacts に保存）

## 2. 成果サマリー
| 指標 | 結果 | 補足 |
|------|------|------|
| 手動ログ確認時間削減 | xx% | 担当者ヒアリング結果 |
| summary 有用性評価 | x/5 | Ops 担当者の主観評価 |
| anomalies 実検知率 | xx% | 実際のインシデントと一致した割合 |
| 実行失敗率 | xx% | ステップ失敗 / 総実行回数 |
| 平均応答時間 | xx 秒 | Gemini API 応答時間概要 |
| API 利用コスト | xx 円 | PoC 期間中の合計 |

### 所感・メモ
- 例: summary で○○が検知できた／異常感知の粒度が粗かった 等

## 3. 技術メモ
- 実装ファイル: `scripts/automation/run-gemini-log-summary.mjs`
- Secrets: `GEMINI_API_KEY`（GitHub Actions）
- フェイルセーフ: ステップ失敗時もワークフロー継続し、`status=error` を記録
- 入力サニタイズ: user_hash のみを送信。メッセージ本文は文字数のみ保持
- メトリクス集計: `node scripts/automation/report-gemini-metrics.mjs --input <artifact-or-directory> --markdown` で JSONL Artifact (`gemini-metrics`) を集約

## 4. 今後の検討事項
- PlanDelta 補助やドキュメント生成等、追加ユースケースの可能性
- Supabase Edge Functions からの直接コール是非
- 自動承認フローや Codex 連携への組み込み要否

## 5. 結論
- **導入判定**: [継続 / 追加検証 / 見送り]
- 理由:
  - 
