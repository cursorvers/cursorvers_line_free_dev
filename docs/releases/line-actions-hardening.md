# Release Notes – Line Actions Hardening

## 概要
- GitHub Actions の主要ワークフローを再編し、依存スクリプトのベンドル化・前提条件チェック・ログ保全を標準化。
- 旧 `webhook-event-router.yml` を廃止し、`webhook-handler.yml` に状態ラベル更新ロジックを統合。
- CI に Action スクリプト向けテスト／actionlint／`act` スモークテストを追加。

## 変更点
- `scripts/vendor/**` と `scripts/vendor/manifest.json` を追加し、Supabase／Google Sheets ヘルパーをリポジトリ内で管理。`npm run vendor:sync` / `vendor:verify` を用意。
- `.github/actions/validate-config` で `line-event.yml` / `manus-progress.yml` の secrets/vars を起動前に検証。`SKIP_CONFIG_VALIDATION` で一時的にスキップ可能。
- `.github/actions/persist-progress` により、ログコミット失敗時に Artifact (`progress-log-*`) を自動生成。
- `scripts/webhook-router.mjs` へ移行し、`webhook-handler.yml` 側で Issue/Comment の状態ラベル更新を実行。旧ワークフローは削除。
- `scripts/logs/archive.mjs` と `tests/actions/log-archive.test.mjs` を追加し、ログ退避処理をユニットテストで網羅。
- `.github/workflows/node-tests.yml` に `npm run test:actions`、`npm run vendor:verify`、`rhysd/actionlint@v1`、PR ラベル `ci-smoke` 時限定の `act` ドライランジョブを追加。

## 運用への影響
- Secrets/vars が不足しているとワークフローが早期失敗するため、設定変更時は `config/workflows/required-secrets.json` を参照し漏れを防ぐ。
- ログ Artifact は 90 日保持。push 失敗時は GitHub Actions の Artifact からダウンロードして監査証跡を保全する。
- ベンダースクリプト更新時は `npm run vendor:sync` → `npm run vendor:verify` → 差分確認の手順を必ず踏む。

## Sign-off

### Ops Lead
- [x] 実行結果を確認
- [x] Artifactの内容を確認
- [x] セキュリティ要件を確認
- 承認日時: 2025-11-06T09:23:18Z
- 署名: @cursorvers

### Compliance
- [x] 実行結果を確認
- [x] Artifact保持期間（90日）を確認
- [x] セキュリティ要件を確認
- 承認日時: 2025-11-06T09:23:18Z
- 署名: @cursorvers

**承認完了**: 2025-11-06 - Issue #8にてOps/Compliance両方のサインオフが完了しました。

**参考**:
- Issue #8: https://github.com/mo666-med/cursorvers_line_free_dev/issues/8
- 実行ログ: https://github.com/mo666-med/cursorvers_line_free_dev/actions/runs/19130277482
- サインオフドキュメント: `docs/OPS_COMPLIANCE_SIGNOFF.md`
