# T7: 経済サーキットブレーカのドリル計画

## 📋 ドリル計画概要

経済サーキットブレーカの動作を検証するためのドリル計画です。ベンダーコストモックを使用し、`MANUS_ENABLED`と`degraded.flag`の切り替えをテストします。

## 🎯 ドリルシナリオ

### シナリオ1: 警告閾値（80%）到達

**目的**: 警告閾値に達した際の通知とログ記録を検証

**前提条件**:
- `MANUS_ENABLED=true`
- `DEVELOPMENT_MODE=true`
- `BUDGET.yml`の月次予算: $100 USD
- 警告閾値: 80% ($80 USD)

**実行手順**:

1. **モックコストデータの準備**
   ```bash
   # テスト用コストデータ（80% = $80）
   node scripts/budget/collect-costs.js \
     --sample \
     --sample-anthropic 45.00 \
     --sample-firebase 20.00 \
     --sample-github-minutes 150
   ```

2. **economic-circuit-breaker.ymlを手動実行**
   ```bash
   gh workflow run economic-circuit-breaker.yml \
     --ref main \
     -f force_check=true
   ```

3. **確認ポイント**:
   - ✅ 警告Issueが作成される
   - ✅ `threshold_state=warning`がSupabaseに記録される
   - ✅ `MANUS_ENABLED`は変更されない（`true`のまま）
   - ✅ ログに警告メッセージが記録される

### シナリオ2: 緊急閾値（150%）到達

**目的**: 緊急閾値に達した際の`MANUS_ENABLED=false`設定と`degraded.flag`作成を検証

**前提条件**:
- `MANUS_ENABLED=true`
- `DEVELOPMENT_MODE=true`
- `BUDGET.yml`の月次予算: $100 USD
- 緊急閾値: 150% ($150 USD)

**実行手順**:

1. **モックコストデータの準備**
   ```bash
   # テスト用コストデータ（150% = $150）
   node scripts/budget/collect-costs.js \
     --sample \
     --sample-anthropic 90.00 \
     --sample-firebase 40.00 \
     --sample-github-minutes 200
   ```

2. **economic-circuit-breaker.ymlを手動実行**
   ```bash
   gh workflow run economic-circuit-breaker.yml \
     --ref main \
     -f force_check=true
   ```

3. **確認ポイント**:
   - ✅ 緊急Issueが作成される
   - ✅ `threshold_state=emergency`がSupabaseに記録される
   - ✅ `MANUS_ENABLED`が`false`に変更される
   - ✅ `degraded.flag`ファイルが作成される
   - ✅ 通知が送信される（Slack/ICS）

4. **復旧手順**:
   ```bash
   # MANUS_ENABLEDをtrueに戻す
   gh variable set MANUS_ENABLED --body "true"
   
   # degraded.flagを削除
   git rm orchestration/plan/production/degraded.flag
   git commit -m "drill: remove degraded.flag after emergency drill"
   git push origin main
   ```

### シナリオ3: degraded.flag切り替えテスト

**目的**: `degraded.flag`ファイルの存在による縮退モード動作を検証

**実行手順**:

1. **degraded.flagファイルを作成**
   ```bash
   touch orchestration/plan/production/degraded.flag
   git add orchestration/plan/production/degraded.flag
   git commit -m "drill: add degraded.flag for testing"
   git push origin main
   ```

2. **line-event.ymlを実行**
   ```bash
   gh workflow run line-event.yml --ref main
   ```

3. **確認ポイント**:
   - ✅ `mode=degraded`が判定される
   - ✅ `reason=flag_file_present`が記録される
   - ✅ `degraded_plan.json`が使用される
   - ✅ Manus dispatchがスキップされる

4. **復旧手順**:
   ```bash
   # degraded.flagを削除
   git rm orchestration/plan/production/degraded.flag
   git commit -m "drill: remove degraded.flag after test"
   git push origin main
   ```

### シナリオ4: MANUS_ENABLED切り替えテスト

**目的**: `MANUS_ENABLED`変数の切り替えによる縮退モード動作を検証

**実行手順**:

1. **MANUS_ENABLEDをfalseに設定**
   ```bash
   gh variable set MANUS_ENABLED --body "false"
   ```

2. **line-event.ymlを実行**
   ```bash
   gh workflow run line-event.yml --ref main
   ```

3. **確認ポイント**:
   - ✅ `mode=degraded`が判定される
   - ✅ `reason=manus_disabled`が記録される
   - ✅ `degraded_plan.json`が使用される
   - ✅ Manus dispatchがスキップされる

4. **復旧手順**:
   ```bash
   # MANUS_ENABLEDをtrueに戻す
   gh variable set MANUS_ENABLED --body "true"
   ```

## 📊 ベンダーコストモック

### モックデータソース

1. **Anthropic API**: CSV形式
   - ファイル: `tests/fixtures/budget/anthropic-costs.csv`
   - 形式: `date,cost_usd`

2. **Firebase**: JSON形式
   - ファイル: `tests/fixtures/budget/firebase-costs.json`
   - 形式: `{"entries": [{"date": "...", "cost_usd": ...}]}`

3. **GitHub Actions**: JSON形式
   - ファイル: `tests/fixtures/budget/github-costs.json`
   - 形式: `{"minutes": ..., "usd_per_minute": ...}`

### モックデータ生成

```bash
# サンプルデータ生成
node scripts/budget/collect-costs.js \
  --sample \
  --sample-anthropic 45.00 \
  --sample-firebase 20.00 \
  --sample-github-minutes 150
```

## 🔄 ドリル実行フロー

```
1. ベンダーコストモック準備
   ↓
2. economic-circuit-breaker.yml実行
   ↓
3. 閾値判定
   ├─ 80%未満: 正常
   ├─ 80-150%: 警告（MANUS_ENABLED=true維持）
   └─ 150%以上: 緊急（MANUS_ENABLED=false + degraded.flag作成）
   ↓
4. line-event.yml実行（縮退モード検証）
   ↓
5. 復旧手順実行
```

## 📝 ドリル実行チェックリスト

### 事前準備
- [ ] `BUDGET.yml`の設定確認
- [ ] モックデータの準備
- [ ] GitHub Variablesの確認
- [ ] Supabase接続確認

### 警告閾値ドリル
- [ ] モックコストデータ（80%）準備
- [ ] economic-circuit-breaker.yml実行
- [ ] 警告Issue作成確認
- [ ] Supabase記録確認
- [ ] MANUS_ENABLED変更なし確認

### 緊急閾値ドリル
- [ ] モックコストデータ（150%）準備
- [ ] economic-circuit-breaker.yml実行
- [ ] 緊急Issue作成確認
- [ ] MANUS_ENABLED=false変更確認
- [ ] degraded.flag作成確認
- [ ] 通知送信確認
- [ ] 復旧手順実行

### degraded.flag切り替えテスト
- [ ] degraded.flag作成
- [ ] line-event.yml実行
- [ ] mode=degraded確認
- [ ] degraded_plan.json使用確認
- [ ] 復旧手順実行

### MANUS_ENABLED切り替えテスト
- [ ] MANUS_ENABLED=false設定
- [ ] line-event.yml実行
- [ ] mode=degraded確認
- [ ] 復旧手順実行

## 🔗 関連ファイル

- `.github/workflows/economic-circuit-breaker.yml`: 経済サーキットブレーカ
- `.github/workflows/line-event.yml`: LINE Event Handler
- `scripts/budget/collect-costs.js`: コスト収集スクリプト
- `BUDGET.yml`: 予算設定
- `orchestration/plan/production/degraded_plan.json`: 縮退モード用Plan

## ⚠️ 注意事項

1. **ドリル実行後は必ず復旧手順を実行**
   - `MANUS_ENABLED`を`true`に戻す
   - `degraded.flag`を削除

2. **本番環境での実行は慎重に**
   - 開発環境（`DEVELOPMENT_MODE=true`）で事前テスト
   - 本番環境では承認を得てから実行

3. **モックデータの管理**
   - テスト用モックデータは`tests/fixtures/budget/`に配置
   - 本番環境では実際のコストデータを使用

