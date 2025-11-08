# Manus API連動 - 実装開始

## ✅ Issue作成完了

- **Issue #2**: Manus API連動の実装
- **URL**: https://github.com/mo666-med/cursorvers_line_free_dev/issues/2
- **ラベル**: `🔌 api`, `🏗️ state:implementing`, `⚠️ priority:P1-High`

## 📋 実装計画

実装計画書を作成しました：
- `docs/MANUS_API_INTEGRATION_PLAN.md`

## 🔄 次のステップ

### 1. GitHub Secretsの設定（実装前に必要）

Manus APIを使用するには、以下のSecretsを設定する必要があります：

```bash
# Manus API
gh secret set MANUS_API_KEY --body "your-manus-api-key"
gh secret set PROGRESS_WEBHOOK_URL --body "https://your-domain.jp/functions/relay"

# GPT解析用（オプション）
gh secret set LLM_ENDPOINT --body "https://api.openai.com/v1/chat/completions"
gh secret set LLM_API_KEY --body "sk-..."

# Connectors（必要に応じて）
gh secret set CONNECTOR_LINEBOT --body "uuid-..."
gh secret set CONNECTOR_SUPABASE --body "uuid-..."
```

### 2. GitHub Variablesの設定

```bash
gh variable set MANUS_BASE_URL --body "https://api.manus.im"
gh variable set VERIFIED_DOMAIN --body "https://your-verified-domain.jp"
```

### 3. 実装項目

Miyabiのエージェントが以下を実装します：

1. **Manus API呼び出し関数の作成**
   - タスク作成API
   - タスク状態確認API
   - タスクキャンセルAPI

2. **`line-event.yml`の実装**
   - LINE EventからPlan JSONを生成
   - Manus APIを呼び出してタスクを作成
   - エラーハンドリング

3. **`manus-progress.yml`の実装**
   - Progress Eventを解析
   - GPTで解析（オプション）
   - PlanDeltaを更新

## 🔗 リンク

- Issue: https://github.com/mo666-med/cursorvers_line_free_dev/issues/2
- 実装計画: https://github.com/mo666-med/cursorvers_line_free_dev/blob/main/docs/MANUS_API_INTEGRATION_PLAN.md
- Actions: https://github.com/mo666-med/cursorvers_line_free_dev/actions

## ⚠️ 注意事項

- Manus APIのAPIキーが必要です
- PROGRESS_WEBHOOK_URLは、Manusから進捗を受け取るWebhook URLです
- 実装前にGitHub Secretsを設定してください

