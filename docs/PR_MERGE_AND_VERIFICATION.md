# PR #4 マージと検証手順

## 📋 PR #4 のマージ方法

### 方法1: GitHub CLIでマージ（推奨）

```bash
# PRの詳細を確認
gh pr view 4

# Squash and mergeでマージ（ブランチも自動削除）
gh pr merge 4 --squash --delete-branch

# または、通常のマージ
gh pr merge 4 --merge --delete-branch
```

### 方法2: GitHub Web UIでマージ

1. **PRページを開く**
   - https://github.com/mo666-med/cursorvers_line_free_dev/pull/4

2. **マージ方法を選択**
   - 「Merge pull request」ボタンをクリック
   - マージ方法を選択：
     - **Squash and merge**（推奨）: 複数のコミットを1つにまとめる
     - **Create a merge commit**: マージコミットを作成
     - **Rebase and merge**: リベースしてマージ

3. **マージを確定**
   - 「Confirm merge」をクリック

## 🔄 マージ後のローカル環境の更新

```bash
# mainブランチに切り替え
git checkout main

# 最新の変更を取得
git fetch origin
git pull origin main

# featureブランチを削除（リモートで既に削除されている場合）
git branch -d feature/line-event-degraded-flow
```

## ✅ マージ後の検証手順

### ステップ1: ワークフローの動作確認

```bash
# mainブランチで手動実行
gh workflow run line-event.yml --ref main

# 実行ログを確認
gh run list --workflow=line-event.yml --limit 1
gh run view <RUN_ID> --log
```

### ステップ2: 縮退モードのテスト

#### 2-1. MANUS_ENABLED=false でテスト

```bash
# GitHub Variablesを確認
gh variable list | grep MANUS_ENABLED

# MANUS_ENABLEDをfalseに設定（テスト用）
gh variable set MANUS_ENABLED --body "false"

# ワークフローを手動実行
gh workflow run line-event.yml --ref main

# 実行ログで以下を確認：
# - "Resolve Plan Mode"ステップで mode=degraded が出力される
# - "Dispatch to Manus"ステップがスキップされる
# - degraded_plan.jsonが使用される

# テスト後、MANUS_ENABLEDをtrueに戻す
gh variable set MANUS_ENABLED --body "true"
```

#### 2-2. degraded.flag ファイルでテスト

```bash
# degraded.flagファイルを作成
touch orchestration/plan/production/degraded.flag

# コミットしてプッシュ
git add orchestration/plan/production/degraded.flag
git commit -m "test: add degraded.flag for testing"
git push origin main

# ワークフローを手動実行して動作確認
gh workflow run line-event.yml --ref main

# テスト後、degraded.flagを削除
git rm orchestration/plan/production/degraded.flag
git commit -m "test: remove degraded.flag"
git push origin main
```

### ステップ3: 実行ログの確認ポイント

以下の点を確認してください：

1. **Resolve Plan Mode ステップ**
   ```
   mode=degraded
   plan_source=orchestration/plan/production/degraded_plan.json
   ```

2. **Dispatch to Manus ステップ**
   - `MANUS_ENABLED=false` または `mode=degraded` の場合、ステップがスキップされる
   - ログに「Skipping step」が表示される

3. **Plan の読み込み**
   - degradedモードの場合、`degraded_plan.json`が使用される
   - 正常モードの場合、`current_plan.json`が使用される

## 📝 次のステップ（T5/T6/T7）

### T5: DevOps - actシナリオ追加とICSドリル連携

```bash
# actシナリオの追加（.github/workflows/line-event.yml用）
# 正常系と縮退系のテストケースを作成

# ICSドリル連携
# docs/alerts/line_degraded_outreach.ics を使用したドリルを実施
```

### T6: DevOps - Manus再試行テストマトリクス

```bash
# テストケースの作成
# - success: 正常終了
# - retry: 再試行が必要
# - amend: Plan修正が必要

# Supabase fixtures の準備
# Manus mocks の準備
```

### T7: Finance/DevOps - ベンダーコストモック確認

```bash
# ベンダーコストモックの入力ソースを確認
# MANUS_ENABLED=false + degraded.flag のテスト計画を整備
```

## 🚨 トラブルシューティング

### PRがマージできない場合

```bash
# コンフリクトを確認
gh pr view 4 --json mergeable,mergeStateStatus

# コンフリクトがある場合は解決
git checkout feature/line-event-degraded-flow
git fetch origin
git rebase origin/main
# コンフリクトを解決
git push origin feature/line-event-degraded-flow --force-with-lease
```

### ワークフローが実行されない場合

```bash
# ワークフローの構文を確認
gh workflow view line-event.yml

# 手動実行でエラーを確認
gh workflow run line-event.yml --ref main
```

### 縮退モードが動作しない場合

```bash
# GitHub Variablesを確認
gh variable list | grep -E "MANUS_ENABLED|DEGRADED_MODE"

# 実行ログで"Resolve Plan Mode"ステップを確認
gh run view <RUN_ID> --log | grep -A 20 "Resolve Plan Mode"
```

## 📚 関連ドキュメント

- `docs/RUNBOOK.md`: 運用マニュアル
- `README.md`: プロジェクト概要
- `.github/workflows/line-event.yml`: ワークフロー定義

