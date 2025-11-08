# 承認後デプロイ手順書

## 概要

Ops/Complianceのサインオフ承認後、本番環境へのデプロイを実施する手順書です。

## 前提条件

- [ ] Issue #8でOps Leadのサインオフが完了
- [ ] Issue #8でComplianceのサインオフが完了
- [ ] `docs/releases/line-actions-hardening.md`のSign-off欄に記載が完了

## デプロイ手順

### Step 1: 最終検証の実行

```bash
# 本番環境での最終検証
gh workflow run manus-api-inquiry.yml -f create_issue=false

# 実行結果を確認（成功を確認）
gh run list --workflow manus-api-inquiry.yml --limit 1

# 実行ログを確認
gh run view <run-id> --log
```

**確認ポイント**:
- ✅ ワークフローが正常に実行される
- ✅ すべてのステップが成功する
- ✅ Artifactが生成される
- ✅ エラーログがない

### Step 2: ブランチのマージ準備

```bash
# 現在のブランチを確認
git branch --show-current

# 変更内容を確認
git log --oneline -10

# テストを再実行して問題がないことを確認
npm test
```

### Step 3: メインブランチへのマージ

```bash
# メインブランチに切り替え
git checkout main
git pull origin main

# ブランチをマージ
git merge chore-run-tests-CcDmo --no-ff -m "feat: Add Manus API inquiry workflow

- Add manus-api-inquiry.yml workflow
- Add inquire-api.mjs script
- Add documentation and signoff process
- Verified with Ops/Compliance signoff"

# マージをプッシュ
git push origin main
```

### Step 4: リリースタグの作成（オプション）

```bash
# リリースタグを作成
git tag -a v1.0.0-manus-inquiry -m "Release: Manus API inquiry workflow

- Manus API問い合わせワークフローを追加
- Ops/Compliance承認済み
- Issue #8参照"

# タグをプッシュ
git push origin v1.0.0-manus-inquiry
```

### Step 5: 本番環境での動作確認

```bash
# メインブランチでワークフローを実行
gh workflow run manus-api-inquiry.yml -f create_issue=true

# 実行結果を確認
gh run list --workflow manus-api-inquiry.yml --limit 1

# 実行ログを確認
gh run view <run-id> --log
```

**確認ポイント**:
- ✅ メインブランチでも正常に動作する
- ✅ Secrets/Variablesが正しく読み込まれる
- ✅ エラーが発生しない

### Step 6: 監視設定の確認

```bash
# ワークフローの実行状況を確認
gh run list --workflow manus-api-inquiry.yml --limit 10

# エラーがないことを確認
gh run list --workflow manus-api-inquiry.yml --limit 10 --json conclusion --jq '.[] | select(.conclusion == "failure")'
```

## ロールバック手順

問題が発生した場合のロールバック手順：

### 緊急停止

```bash
# ワークフローを無効化
gh variable set MANUS_ENABLED --body "false"

# または、ワークフローファイルを削除
git checkout main
git rm .github/workflows/manus-api-inquiry.yml
git commit -m "rollback: Remove manus-api-inquiry workflow"
git push origin main
```

### ブランチのロールバック

```bash
# マージを元に戻す
git checkout main
git revert <merge-commit-hash>
git push origin main
```

## デプロイ後の確認

### 24時間以内の確認項目

- [ ] ワークフローが正常に実行されている
- [ ] エラーログがない
- [ ] Artifactが正常に生成されている
- [ ] Issueが正常に作成されている（create_issue=trueの場合）

### 1週間以内の確認項目

- [ ] ワークフローの実行頻度を確認
- [ ] エラー率を確認
- [ ] Artifactの保持期間を確認
- [ ] セキュリティアラートがない

## トラブルシューティング

### ワークフローが実行されない

```bash
# ワークフローファイルの構文を確認
yamllint .github/workflows/manus-api-inquiry.yml

# ワークフローの状態を確認
gh workflow list | grep manus-api-inquiry
```

### Secrets/Variablesが読み込まれない

```bash
# Secretsの確認
gh secret list | grep MANUS_API_KEY

# Variablesの確認
gh variable list | grep MANUS_BASE_URL

# 環境保護設定を確認
gh api repos/mo666-med/cursorvers_line_free_dev/environments
```

### Artifactが生成されない

```bash
# 実行ログを確認
gh run view <run-id> --log | grep -i artifact

# Artifactの生成ステップを確認
gh run view <run-id> --log | grep -A 10 "Upload Results"
```

## 問い合わせ先

- **Tech Lead**: GitHub `@mo666-med`
- **Issue**: https://github.com/mo666-med/cursorvers_line_free_dev/issues/8
- **Runbook**: `docs/RUNBOOK.md`


