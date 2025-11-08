# セットアップガイド

## 概要

LINE友だち登録システムのセットアップ手順をまとめました。

## 1. GitHub Secrets設定

### OpenAI API設定

```bash
# OpenAI APIキー
gh secret set OPENAI_API_KEY --body "sk-..."

# OpenAI APIエンドポイント（デフォルト）
gh secret set LLM_ENDPOINT --body "https://api.openai.com/v1/chat/completions"

# または、既存のLLM_API_KEYを使用
gh secret set LLM_API_KEY --body "sk-..."
```

**設定場所**: https://github.com/mo666-med/cursorvers_line_free_dev/settings/secrets/actions

### Manus API設定

```bash
# Manus APIキー
gh secret set MANUS_API_KEY --body "your-manus-api-key"

# Progress Webhook URL
gh secret set PROGRESS_WEBHOOK_URL --body "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/relay"
```

### Supabase設定

```bash
# Supabase APIキー
gh secret set SUPABASE_KEY --body "your-supabase-key"

# Supabase Access Token
gh secret set SUPABASE_ACCESS_TOKEN --body "your-supabase-access-token"
```

### Connectors設定

```bash
# LINE Bot Connector
gh secret set CONNECTOR_LINEBOT --body "uuid-..."

# Supabase Connector
gh secret set CONNECTOR_SUPABASE --body "uuid-..."

# Google Calendar Connector
gh secret set CONNECTOR_GCAL --body "uuid-..."

# Gmail Connector
gh secret set CONNECTOR_GMAIL --body "uuid-..."

# Notion Connector
gh secret set CONNECTOR_NOTION --body "uuid-..."
```

## 2. GitHub Variables設定

```bash
# OpenAI Model
gh variable set OPENAI_MODEL --body "gpt-5"

# Manus Base URL
gh variable set MANUS_BASE_URL --body "https://api.manus.im"

# Supabase URL
gh variable set SUPABASE_URL --body "https://haaxgwyimoqzzxzdaeep.supabase.co"

# Verified Domain
gh variable set VERIFIED_DOMAIN --body "https://your-verified-domain.jp"

# 開発段階/本番環境の切り替え（本番環境ではfalse）
gh variable set DEVELOPMENT_MODE --body "false"
gh variable set GPT_ENABLED --body "false"
gh variable set MANUS_ENABLED --body "false"
```

**設定場所**: https://github.com/mo666-med/cursorvers_line_free_dev/settings/variables/actions

## 3. Front Door（Supabase Edge Function）デプロイ

```bash
cd functions/relay
supabase functions deploy relay --project-ref haaxgwyimoqzzxzdaeep
```

### Front Doorの環境変数設定

```bash
# GitHub PAT（repository_dispatch用）
supabase secrets set GH_PAT --project-ref haaxgwyimoqzzxzdaeep

# GitHub Owner/Repo
supabase secrets set GH_OWNER --project-ref haaxgwyimoqzzxzdaeep
supabase secrets set GH_REPO --project-ref haaxgwyimoqzzxzdaeep

# LINE Channel Secret
supabase secrets set LINE_CHANNEL_SECRET --project-ref haaxgwyimoqzzxzdaeep

# Manus API Key（署名検証用）
supabase secrets set MANUS_API_KEY --project-ref haaxgwyimoqzzxzdaeep

# Kill-Switch（本番環境ではtrue）
supabase secrets set FEATURE_BOT_ENABLED --project-ref haaxgwyimoqzzxzdaeep
```

## 4. LINE Developers ConsoleでWebhook URL設定

```
https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/relay
```

## 5. 確認

### Secrets確認

```bash
gh secret list | grep -E "OPENAI_API_KEY|MANUS_API_KEY|SUPABASE_KEY"
```

### Variables確認

```bash
gh variable list | grep -E "OPENAI_MODEL|SUPABASE_URL|DEVELOPMENT_MODE"
```

### Front Door確認

```bash
curl -X POST https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/relay \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

## トラブルシューティング

### 外部接続の問題

詳細は `EXTERNAL_CONNECTION_TROUBLESHOOTING.md` を参照してください。

### Codex Agent設定

詳細は `CODEX_AGENT_SETUP.md` を参照してください。

