# actテスト実行ガイド

## ⚠️ 重要な注意事項

`act`でのワークフロー実行は**時間がかかります**（数分〜数十分）。特に初回実行時はDockerイメージのダウンロードが必要です。

## 🚀 テスト実行方法

### 方法1: バックグラウンド実行（推奨）

ターミナルで直接実行し、完了を待ちます：

```bash
# 縮退モードテスト
act repository_dispatch \
  -W .github/workflows/line-event.yml \
  --eventpath .github/workflows/.act/line-event-repository-dispatch-degraded.json \
  -s MANUS_ENABLED=false \
  -s DEVELOPMENT_MODE=false \
  --env GITHUB_TOKEN=dummy-token \
  2>&1 | tee act-test-degraded.log

# 正常モードテスト
act repository_dispatch \
  -W .github/workflows/line-event.yml \
  --eventpath .github/workflows/.act/line-event-repository-dispatch-normal.json \
  -s MANUS_ENABLED=true \
  -s DEVELOPMENT_MODE=true \
  --env GITHUB_TOKEN=dummy-token \
  2>&1 | tee act-test-normal.log
```

### 方法2: ヘルパースクリプト使用

```bash
./scripts/test-act-scenarios.sh degraded
./scripts/test-act-scenarios.sh normal
```

## 📋 確認ポイント

実行後、ログで以下を確認してください：

### 縮退モード（degraded）

1. **Resolve Plan Mode ステップ**
   ```
   mode=degraded
   reason=manus_disabled
   ```

2. **Dispatch to Manus ステップ**
   - `Skipping step` が表示される
   - または条件不一致でスキップ

3. **Plan の読み込み**
   - `degraded_plan.json` が使用される

### 正常モード（normal）

1. **Resolve Plan Mode ステップ**
   ```
   mode=normal
   ```

2. **Dispatch to Manus ステップ**
   - ステップが実行される（シークレットが必要な場合、エラーになる可能性あり）

3. **Plan の読み込み**
   - `current_plan.json` が使用される

## 🔧 トラブルシューティング

### Dockerイメージがダウンロードされない

初回実行時は自動的にダウンロードされますが、時間がかかります（数GB）。

### 実行がスタックする

`act`は実際のワークフローを実行するため、時間がかかります：
- 各ステップの実行
- Dockerコンテナの起動
- 外部APIへの接続（タイムアウトまで待つ）

**対処法**: ログを確認しながら待つか、別のターミナルで実行状況を監視します。

### シークレットエラー

実際のAPIキーが必要なステップではエラーになりますが、**縮退モードの動作確認には影響ありません**。

## 📊 実行時間の目安

- **初回実行**: 5-10分（Dockerイメージダウンロード含む）
- **2回目以降**: 2-5分
- **縮退モード**: 比較的早く完了（Manus dispatchがスキップされるため）

## 🎯 推奨実行順序

1. **まず縮退モードをテスト**（時間がかかりにくい）
2. **正常モードをテスト**（必要に応じて）

## 📝 ログの確認

実行ログは以下のファイルに保存されます：

```bash
# 縮退モード
cat act-test-degraded.log | grep -E "(mode=|reason=|Skipping|degraded_plan)"

# 正常モード
cat act-test-normal.log | grep -E "(mode=|current_plan|Dispatch)"
```

## ✅ 成功の判定

### 縮退モード

- ✅ `mode=degraded` が出力される
- ✅ `reason=manus_disabled` が出力される
- ✅ `Dispatch to Manus` ステップがスキップされる
- ✅ `degraded_plan.json` が読み込まれる

### 正常モード

- ✅ `mode=normal` が出力される
- ✅ `current_plan.json` が読み込まれる
- ⚠️ `Dispatch to Manus` ステップはシークレットが必要（エラーでも正常）

