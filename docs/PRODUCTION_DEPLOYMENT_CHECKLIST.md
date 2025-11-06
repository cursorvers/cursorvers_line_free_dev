# 本番環境デプロイ準備チェックリスト

## 前提条件確認

### 1. Secrets/Variables設定確認
```bash
# 必須Secretsの確認
gh secret list | grep -E "MANUS_API_KEY|SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|ACTIONS_CONTENTS_PAT"

# 必須Variablesの確認
gh variable list | grep -E "MANUS_BASE_URL|MANUS_ENABLED|SUPABASE_URL|DEVELOPMENT_MODE"
```

### 2. ワークフロー検証
```bash
# 最新の実行結果を確認
gh run list --workflow manus-api-inquiry.yml --limit 1

# テスト実行
gh workflow run manus-api-inquiry.yml -f create_issue=false
```

### 3. ドキュメント確認
- [ ] `docs/RUNBOOK.md`の内容を確認
- [ ] `docs/OPS_COMPLIANCE_SIGNOFF.md`の内容を確認
- [ ] `docs/releases/line-actions-hardening.md`のSign-off欄を確認

## デプロイ前チェックリスト

### セキュリティ
- [ ] すべてのSecretsが適切に設定されている
- [ ] ワークフローファイルに機密情報が含まれていない
- [ ] Artifact保持期間がCompliance要件に適合している（90日）

### 機能確認
- [ ] Manus API問い合わせワークフローが正常に動作する
- [ ] エンドポイントが正しく設定されている
- [ ] 認証が正常に動作する

### ドキュメント
- [ ] Runbookが最新の状態である
- [ ] 成功事例が記録されている
- [ ] Sign-off欄が準備されている

## デプロイ手順（承認後）

### Step 1: 最終検証
```bash
# 本番環境での最終検証
gh workflow run manus-api-inquiry.yml -f create_issue=true

# 実行結果を確認
gh run list --workflow manus-api-inquiry.yml --limit 1
```

### Step 2: リリース準備
```bash
# ブランチをmainにマージ
git checkout main
git merge chore-run-tests-CcDmo

# タグを作成（必要に応じて）
git tag -a v1.0.0 -m "Release: Manus API inquiry workflow"
git push origin v1.0.0
```

### Step 3: 運用開始
- [ ] ワークフローが本番環境で正常に動作することを確認
- [ ] 監視設定を有効化
- [ ] アラート設定を確認

## ロールバック手順

問題が発生した場合のロールバック手順：

```bash
# ワークフローを無効化
gh variable set MANUS_ENABLED --body "false"

# または、ワークフローファイルを削除
git rm .github/workflows/manus-api-inquiry.yml
git commit -m "rollback: Remove manus-api-inquiry workflow"
git push
```

## 監視とメンテナンス

### 定期確認項目
- [ ] ワークフローの実行状況を週次で確認
- [ ] Artifactの保持期間を確認
- [ ] エラーログを確認

### アラート設定
- [ ] ワークフロー失敗時の通知設定
- [ ] Artifact保持期間の警告設定
- [ ] セキュリティアラートの設定

