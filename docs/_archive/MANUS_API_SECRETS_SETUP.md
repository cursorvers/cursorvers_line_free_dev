# Manus API認証情報の設定方法

## 推奨: GitHub Secretsを使用

**GitHub ActionsワークフローからManus APIを呼び出す場合は、GitHub Secretsを使用することを推奨します。**

### 理由
1. **セキュリティ**: Secretsは暗号化されて保存され、ログに表示されない
2. **GitHub Actionsとの統合**: ワークフロー内で直接`${{ secrets.MANUS_API_KEY }}`として参照可能
3. **チーム共有**: リポジトリの権限を持つメンバー全員が使用可能
4. **監査**: GitHub Actionsのログで誰が使用したか追跡可能

## 設定方法

### 1. GitHub Secretsに設定

**リポジトリ**: `mo666-med/cursorvers_line_free_dev`

```bash
# 現在のリポジトリで実行（既にリポジトリディレクトリにいる場合）
cd /Users/masayuki/Dev/cursorvers_line_free_dev

# Manus APIキー
gh secret set MANUS_API_KEY --body "your-manus-api-key"

# 進捗Webhook URL
gh secret set PROGRESS_WEBHOOK_URL --body "https://your-domain.jp/functions/relay"

# GPT解析用（オプション）
gh secret set LLM_ENDPOINT --body "https://api.openai.com/v1/chat/completions"
gh secret set LLM_API_KEY --body "sk-..."

# Connectors（必要に応じて）
gh secret set CONNECTOR_LINEBOT --body "uuid-..."
gh secret set CONNECTOR_SUPABASE --body "uuid-..."

# Supabase（必要に応じて）
gh secret set SUPABASE_ACCESS_TOKEN --body "..."
```

### 2. GitHub Variablesに設定（公開情報用）

```bash
# Manus APIのベースURL（公開情報）
gh variable set MANUS_BASE_URL --body "https://api.manus.im"

# Verified Domain（公開情報）
gh variable set VERIFIED_DOMAIN --body "https://your-verified-domain.jp"
```

### 別のリポジトリに設定する場合

```bash
# リポジトリを明示的に指定
gh secret set MANUS_API_KEY --body "your-manus-api-key" --repo mo666-med/cursorvers_line_free_dev
gh variable set MANUS_BASE_URL --body "https://api.manus.im" --repo mo666-med/cursorvers_line_free_dev
```

## ワークフローでの使用方法

### `line-event.yml`での使用例

```yaml
- name: Dispatch to Manus
  env:
    MANUS_API_KEY: ${{ secrets.MANUS_API_KEY }}
    MANUS_BASE_URL: ${{ vars.MANUS_BASE_URL }}
    PROGRESS_WEBHOOK_URL: ${{ secrets.PROGRESS_WEBHOOK_URL }}
  run: |
    node scripts/manus-api.js create \
      orchestration/MANUS_EXECUTION_BRIEF_v2.0.txt \
      orchestration/plan/current_plan.json
```

## Miyabiエージェントで使用する場合

Miyabiエージェントがローカルで実行される場合（`.env`ファイル使用）と、GitHub Actions上で実行される場合で異なります。

### ローカル実行（`.env`ファイル）

```bash
# .envファイル（Git管理外）
MANUS_API_KEY=your-manus-api-key
PROGRESS_WEBHOOK_URL=https://your-domain.jp/functions/relay
MANUS_BASE_URL=https://api.manus.im
```

### GitHub Actions上で実行

MiyabiエージェントがGitHub Actions上で実行される場合、GitHub Secretsを参照します：

```yaml
- name: Run Miyabi Agent
  env:
    MANUS_API_KEY: ${{ secrets.MANUS_API_KEY }}
    PROGRESS_WEBHOOK_URL: ${{ secrets.PROGRESS_WEBHOOK_URL }}
  run: |
    npx miyabi agent run --issue 2
```

## 設定の確認

### Secretsの確認

```bash
gh secret list
```

### Variablesの確認

```bash
gh variable list
```

### 設定されているか確認

```bash
# ワークフローを実行して確認
gh workflow run line-event.yml

# 実行ログを確認（Secretsの値は表示されない）
gh run list --workflow=line-event.yml
```

## まとめ

| 用途 | 推奨方法 | 理由 |
|------|---------|------|
| GitHub Actionsワークフロー | GitHub Secrets | セキュリティ・統合性 |
| ローカル開発（Miyabi CLI） | `.env`ファイル | 開発環境での利便性 |
| GitHub Actions上のMiyabi | GitHub Secrets | セキュリティ・統一性 |

**結論**: GitHub ActionsからManus APIを呼び出す場合は、**GitHub Secretsを使用**してください。

