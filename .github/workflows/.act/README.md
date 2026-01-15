# actシナリオ - line-event.yml テスト

このディレクトリには、`act`を使用してローカルで`line-event.yml`ワークフローをテストするためのシナリオファイルが含まれています。

## 前提条件

`act`をインストールする必要があります：

```bash
# macOS
brew install act

# または
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

## 使用方法

### 正常系テスト

```bash
# repository_dispatchイベントで実行
act repository_dispatch \
  -W .github/workflows/line-event.yml \
  --eventpath .github/workflows/.act/line-event-repository-dispatch-normal.json \
  -e GITHUB_TOKEN=your-token \
  -s MANUS_ENABLED=true \
  -s DEVELOPMENT_MODE=true

# workflow_dispatchイベントで実行
act workflow_dispatch \
  -W .github/workflows/line-event.yml \
  --eventpath .github/workflows/.act/line-event-normal.yml
```

### 縮退系テスト

```bash
# repository_dispatchイベントで実行（MANUS_ENABLED=false）
act repository_dispatch \
  -W .github/workflows/line-event.yml \
  --eventpath .github/workflows/.act/line-event-repository-dispatch-degraded.json \
  -e GITHUB_TOKEN=your-token \
  -s MANUS_ENABLED=false \
  -s DEVELOPMENT_MODE=false

# workflow_dispatchイベントで実行
act workflow_dispatch \
  -W .github/workflows/line-event.yml \
  --eventpath .github/workflows/.act/line-event-degraded.yml
```

## 環境変数の設定

actで実行する際は、以下の環境変数やシークレットを設定する必要があります：

```bash
# 必須シークレット
-s SUPABASE_SERVICE_ROLE_KEY=your-key
-s SUPABASE_URL=your-url
-s MANUS_API_KEY=your-key
-s PROGRESS_WEBHOOK_URL=your-url

# 必須変数
-e MANUS_ENABLED=true  # または false（縮退テスト用）
-e DEVELOPMENT_MODE=true  # または false
-e MANUS_BASE_URL=https://api.manus.ai
```

## テストシナリオ

### 正常系（normal）
- `MANUS_ENABLED=true`
- `DEVELOPMENT_MODE=true`
- `mode=normal`
- Manus dispatch が実行される

### 縮退系（degraded）
- `MANUS_ENABLED=false`
- `DEVELOPMENT_MODE=false`
- `mode=degraded`
- Manus dispatch がスキップされる
- `degraded_plan.json` が使用される

## 確認ポイント

各テスト実行後、以下を確認してください：

1. **Resolve Plan Mode ステップ**
   - 正常系: `mode=normal`
   - 縮退系: `mode=degraded`, `reason=manus_disabled`

2. **Dispatch to Manus ステップ**
   - 正常系: 実行される
   - 縮退系: スキップされる

3. **Plan の読み込み**
   - 正常系: `current_plan.json`
   - 縮退系: `degraded_plan.json`

4. **Step Summary**
   - 縮退系の場合、縮退理由とICS案内が表示される

## トラブルシューティング

### actがインストールされていない場合

```bash
# macOS
brew install act

# 確認
act --version
```

### Dockerが必要

`act`はDockerを使用するため、Dockerが起動している必要があります。

```bash
# Dockerの状態確認
docker ps
```

### シークレットの設定

actでシークレットを設定するには、`.secrets`ファイルを作成するか、`-s`オプションで直接指定します。

```bash
# .secretsファイルの例
echo "SUPABASE_SERVICE_ROLE_KEY=your-key" > .secrets
echo "MANUS_API_KEY=your-key" >> .secrets

# 使用
act repository_dispatch -W .github/workflows/line-event.yml --secret-file .secrets
```

