# Cursorvers 日次システム点検レポート

**日時:** 2025年12月18日 06:06:22 JST

## 📊 点検結果サマリー

| 項目 | 状態 | 詳細 |
|------|------|------|
| LINE Bot | ✅ OK | 正常稼働中 |
| Discord Webhook | ⚠️ NG | 接続エラー (Unknown Webhook) |
| Supabase Edge Functions | ⚠️ 要確認 | 認証エラーのためログ確認不可 |
| n8n Workflow | ⚠️ NG | API接続エラー |
| GitHub Repository | ✅ OK | 最新コミット確認完了 |

---

## 🔍 詳細点検結果

### 1. LINE Bot (Supabase Edge Functions)

**エンドポイント:** `https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-webhook`

**テスト方法:**
```bash
curl -X GET "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-webhook"
```

**結果:**
```
OK - line-webhook is running
```

**ステータス:** ✅ **正常稼働中**

LINE Bot Edge Functionは正常に応答しており、問題ありません。

---

### 2. Discord Webhook

**テスト方法:**
```bash
curl -X POST "https://discord.com/api/webhooks/[WEBHOOK_ID]/[WEBHOOK_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"content": "🔍 Discord Webhook接続テスト"}'
```

**結果:**
```json
{"message": "Unknown Webhook", "code": 10015}
```

**ステータス:** ⚠️ **接続エラー**

**問題点:**
- Webhook URLが無効または削除されている可能性があります
- Discord側でWebhookが削除された、またはURLが変更された可能性があります

**推奨対応:**
1. Discordサーバーの設定から新しいWebhook URLを生成
2. 環境変数 `DISCORD_WEBHOOK_URL` を更新
3. 再度接続テストを実施

---

### 3. Supabase Edge Functions

**プロジェクトID:** `haaxgwyimoqzzxzdaeep`

**テスト方法:**
```bash
manus-mcp-cli tool call get_logs --server supabase \
  --input '{"project_id": "haaxgwyimoqzzxzdaeep", "service": "edge-function"}'
```

**結果:**
```
Error: Unauthorized. Please provide a valid access token to the MCP server 
via the --access-token flag or SUPABASE_ACCESS_TOKEN.
```

**ステータス:** ⚠️ **認証エラー**

**問題点:**
- Supabase MCP サーバーの認証トークンが設定されていない、または期限切れ
- ログの詳細確認ができない状態

**推奨対応:**
1. Supabase Access Tokenを再生成
2. MCP サーバーの設定を更新
3. 認証後にログを再確認

---

### 4. n8n Workflow

**エンドポイント:** `$N8N_INSTANCE_URL/api/v1/workflows`

**テスト方法:**
```bash
curl -X GET "$N8N_INSTANCE_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

**結果:**
```
HTMLレスポンス (n8n Editor-UI)
```

**ステータス:** ⚠️ **API接続エラー**

**問題点:**
- APIエンドポイントではなくWebインターフェースが返却されている
- n8n API KEYが無効、またはAPIエンドポイントが正しく設定されていない可能性

**推奨対応:**
1. n8n インスタンスのAPI設定を確認
2. API KEYの有効性を確認
3. 正しいAPIエンドポイントURLを確認

---

### 5. GitHub Repository

**リポジトリ:** `mo666-med/cursorvers_line_free_dev`

**最新コミット情報:**
```
docs: Add daily system check log with data integrity check (2025-12-17) (5ae8fff)
```

**最終プッシュ日時:** 2025-12-17T19:14:50Z

**ステータス:** ✅ **正常**

GitHubリポジトリは正常にアクセス可能で、最新のコミット情報も取得できました。

---

## 🔧 自動修繕の実施状況

今回の点検では、以下の理由により自動修繕は実施していません:

1. **Discord Webhook:** Webhook URLの再生成が必要なため、手動での対応が必要
2. **Supabase:** 認証トークンの設定が必要なため、手動での対応が必要
3. **n8n:** API設定の確認が必要なため、手動での対応が必要

---

## 📋 推奨アクション

### 優先度: 高
1. **Discord Webhook URLの再生成と更新**
   - Discordサーバーの設定から新しいWebhook URLを生成
   - 環境変数を更新

2. **Supabase Access Tokenの設定**
   - Supabaseダッシュボードから新しいAccess Tokenを生成
   - MCP サーバーの設定を更新

### 優先度: 中
3. **n8n API設定の確認**
   - n8n インスタンスのAPI設定を確認
   - 正しいAPI KEYとエンドポイントを設定

---

## 📝 次回点検予定

**次回点検日時:** 2025年12月19日 06:00 JST

**点検項目:**
- LINE Bot稼働確認
- Discord Webhook接続テスト (修正後)
- Supabase Edge Functionsログ確認 (認証設定後)
- n8n Workflow状態確認 (API設定確認後)
- GitHub最新コミット確認

---

**レポート作成日時:** 2025年12月18日 06:06:22 JST  
**作成者:** Cursorvers 自動点検システム
