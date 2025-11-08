# PR #4 マージ後の検証手順

## ✅ マージ完了

PR #4 が正常にマージされ、以下の変更がmainブランチに反映されました：

- `.github/workflows/line-event.yml`: 縮退理由の記録、通知強化
- `orchestration/plan/production/degraded_plan.json`: 縮退モード用フォールバックPlan
- `docs/alerts/line_degraded_outreach.ics`: ICS配信用テンプレート

## 📋 検証手順

### ステップ1: 縮退ドリルの再実行

#### 1-1. MANUS_ENABLEDをfalseに設定（テスト用）

```bash
# 現在の設定を確認
gh variable list | grep MANUS_ENABLED

# falseに設定（テスト用）
gh variable set MANUS_ENABLED --body "false"
```

#### 1-2. ワークフローを手動実行

```bash
# ワークフローを実行
gh workflow run line-event.yml --ref main

# 実行IDを取得
gh run list --workflow=line-event.yml --limit 1
```

#### 1-3. 実行ログを確認

```bash
# 実行IDを指定してログを確認
gh run view <RUN_ID> --log

# または、最新の実行ログを確認
gh run view --log
```

#### 確認ポイント

以下の点をログで確認してください：

1. **Resolve Plan Mode ステップ**
   ```
   mode=degraded
   reason=manus_disabled  # または forced_variable / flag_file_present
   plan_source=orchestration/plan/production/degraded_plan.json
   ```

2. **Dispatch to Manus ステップ**
   - ステップがスキップされている（`Skipping step` が表示される）
   - または `if: vars.DEVELOPMENT_MODE == 'true' && vars.MANUS_ENABLED == 'true' && steps.mode.outputs.mode != 'degraded'` の条件によりスキップ

3. **Step Summary**
   - 縮退理由（reason）が表示される
   - ICS案内が含まれている

#### 1-4. テスト後、MANUS_ENABLEDをtrueに戻す

```bash
# テスト完了後、本番環境の設定に戻す
gh variable set MANUS_ENABLED --body "true"
```

### ステップ2: degraded.flag ファイルでのテスト（オプション）

```bash
# degraded.flagファイルを作成
touch orchestration/plan/production/degraded.flag

# コミットしてプッシュ
git add orchestration/plan/production/degraded.flag
git commit -m "test: add degraded.flag for testing"
git push origin main

# ワークフローを実行
gh workflow run line-event.yml --ref main

# ログで確認
gh run view --log | grep -A 20 "Resolve Plan Mode"

# テスト後、degraded.flagを削除
git rm orchestration/plan/production/degraded.flag
git commit -m "test: remove degraded.flag"
git push origin main
```

### ステップ3: 実行結果の記録

検証結果を記録してください：

```bash
# 実行IDを記録
RUN_ID=$(gh run list --workflow=line-event.yml --limit 1 --json databaseId --jq '.[0].databaseId')
echo "実行ID: $RUN_ID"

# ログURLを記録
echo "ログURL: https://github.com/mo666-med/cursorvers_line_free_dev/actions/runs/$RUN_ID"
```

### ステップ4: ログローテーション設定の確認

1. `gh workflow run rotate-logs.yml --ref main` を実行し、`logs/progress/` に不要な変更がないか確認。
2. ワークフローが `chore: rotate logs (...)` で自動コミットする場合は、コミット内容と `logs/progress/archive/` をレビュー。
3. リポジトリサイズの警告が出力されていないか Step Summary とログを確認。

## 📝 Phase 1 着手準備

### T5: DevOps - actシナリオ追加とICSドリル連携

**タスク内容:**
- actで通常系/縮退系の2ケースを回すシナリオを作成
- Slack/ICS連携を実働オペ担当へ展開
- Runbook手順のレビューを依頼

**実装手順:**
```bash
# actシナリオの作成
mkdir -p .github/workflows/.act
# 通常系と縮退系のテストケースを作成
```

### T6: DevOps - Manus再試行テストマトリクス

**タスク内容:**
- Manus再試行テストマトリクス（proceed/retry/amend/failure）を整備
- Supabaseモックデータを準備
- PlanDeltaワークフロー実装に備える

**実装手順:**
```bash
# テストマトリクスの作成
# - success: 正常終了
# - retry: 再試行が必要
# - amend: Plan修正が必要
# - failure: 失敗

# Supabase fixtures の準備
mkdir -p tests/fixtures/supabase
```

### T7: Finance/DevOps - ベンダーコストモック確認

**タスク内容:**
- ベンダーコストのモックソースを確定
- MANUS_ENABLED/degraded.flag を切り替える練習を含むテスト計画を作成

**実装手順:**
```bash
# ベンダーコストモックの確認
# - Anthropic
# - Firebase
# - GitHub Actions

# テスト計画の作成
```

## 🚨 トラブルシューティング

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

### ログにreasonが表示されない場合

```bash
# line-event.ymlの"Resolve Plan Mode"ステップを確認
# REASON変数が正しく設定されているか確認
gh run view <RUN_ID> --log | grep -A 30 "Resolve Plan Mode"
```

## 📚 関連ドキュメント

- `docs/RUNBOOK.md`: 運用マニュアル
- `docs/PR_MERGE_AND_VERIFICATION.md`: PRマージ手順
- `.github/workflows/line-event.yml`: ワークフロー定義
