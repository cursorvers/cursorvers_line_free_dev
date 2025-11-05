# Tasks – Gemini Log Summary PoC

| # | タイトル / 目的 | オーナー | 状態 | 関連ファイル | テスト / 検証 |
|---|----------------|----------|------|--------------|----------------|
| G1 | ログサマライザースクリプト実装（Sanitization + Gemini 呼び出し） | DevOps | ✅ | `scripts/automation/run-gemini-log-summary.mjs`, `tests/node/gemini-log-summary.test.mjs`, `tests/fixtures/logs/**` | `npm test -- tests/node/gemini-log-summary.test.mjs` |
| G2 | line-event.yml への統合、アーティファクト化、シークレット検証拡張 | DevOps | ✅ | `.github/workflows/line-event.yml`, `config/workflows/required-secrets.json`, `scripts/verify-secrets.sh` | `npm test`, `workflow_dispatch` による動作確認（要 `GEMINI_API_KEY`） |
| G3 | PoC 文書テンプレート作成（評価指標の記録枠） | Ops Enablement | ✅ | `docs/automation/GEMINI_POC_REPORT.md` | ー |

**次のステップ**
1. `GEMINI_API_KEY` を GitHub Secrets に追加し、`line-event.yml` の手動実行で Step Summary / Artifact を検証。
2. PoC 期間終了後に `docs/automation/GEMINI_POC_REPORT.md` へ実測値と所感を記入し、継続可否を判断。
3. 成果が良好であれば追加ユースケース（PlanDelta 補助など）を `/sdd` で別途要件化。
