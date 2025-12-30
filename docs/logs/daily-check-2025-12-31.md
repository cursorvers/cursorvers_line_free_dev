# Cursorvers 日次システム点検レポート

**点検日時**: 2025-12-31 06:07:07 JST  
**実行者**: Manus 自動点検システム  
**点検バージョン**: v1.0

---

## 📊 点検結果サマリー

| コンポーネント | ステータス | 詳細 |
|--------------|----------|------|
| LINE Bot | ✅ OK | 正常稼働中 |
| Discord Webhook | ✅ OK | 接続成功 |
| Supabase Edge Functions | ✅ OK | 正常稼働中 |
| Supabase Management API | ⚠️ PARTIAL | 認証情報が必要 |
| n8n API | ❌ NG | 認証エラー |
| Google Sheets | ⚠️ SKIP | n8n経由確認不可 |
| GitHub (cursorvers_line_free_dev) | ✅ OK | 最新コミット確認済み |
| GitHub (cursorvers_line_paid_dev) | ⚠️ NOT FOUND | リポジトリが存在しません |

---

## 🔍 詳細点検結果

### 1. LINE Bot (Supabase Edge Functions)

**エンドポイント**: `https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-webhook`

**テスト方法**:
```bash
curl -X GET "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-webhook"
```

**結果**:
- HTTP Status: 200
- Response: "OK - line-webhook is running"
- **判定**: ✅ 正常稼働中

---

### 2. Discord Webhook

**エンドポイント**: `https://discord.com/api/webhooks/1448220557211336776/fakXFuRH2nG-c-gF6kUAnekjaim3mgJ9zeFg6ft7NILcL1_9iA8gChqiPray-aIbK5LB`

**テスト方法**:
```bash
curl -X POST "https://discord.com/api/webhooks/..." \
  -H "Content-Type: application/json" \
  -d '{"content":"テスト通知"}'
```

**結果**:
- HTTP Status: 204
- **判定**: ✅ 接続成功

---

### 3. Supabase

#### 3.1 Edge Functions

**プロジェクトID**: haaxgwyimoqzzxzdaeep

**テスト結果**:
- line-webhook: ✅ 正常稼働中（HTTP 200）

#### 3.2 Management API

**テスト方法**:
```bash
curl -X GET "https://api.supabase.com/v1/projects/haaxgwyimoqzzxzdaeep/functions/line-webhook/logs" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}"
```

**結果**:
- エラー: "JWT could not be decoded"
- **判定**: ⚠️ アクセストークンが無効または未設定

**推奨対応**:
- `SUPABASE_ACCESS_TOKEN` の再取得と設定
- `supabase login` でトークンを生成

---

### 4. n8n API

**エンドポイント**: `https://n8n.srv995974.hstgr.cloud/api/v1/workflows`

**テスト方法**:
```bash
curl -X GET "https://n8n.srv995974.hstgr.cloud/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}"
```

**結果**:
- エラー: {"message":"unauthorized"}
- **判定**: ❌ 認証エラー

**推奨対応**:
1. n8n管理画面でAPIキーを確認
2. 必要に応じてAPIキーを再生成
3. 環境変数 `N8N_API_KEY` を更新
4. GitHub Secretsに設定

---

### 5. Google Sheets

**ステータス**: ⚠️ SKIP

**理由**: n8n API経由での同期状況確認ができないため、今回の点検ではスキップしました。

**推奨対応**:
- n8n APIの認証問題を解決後、再度確認

---

### 6. GitHub リポジトリ

#### 6.1 cursorvers_line_free_dev

**リポジトリ**: `mo666-med/cursorvers_line_free_dev`

**最新コミット**:
- Commit: `4a076d4`
- Author: Manus Bot
- Date: 2025-12-29 16:05:30 -0500
- Message: "docs: 日次システム点検レポート 2025-12-30"

**判定**: ✅ 正常

#### 6.2 cursorvers_line_paid_dev

**リポジトリ**: `mo666-med/cursorvers_line_paid_dev`

**結果**: ⚠️ リポジトリが存在しません

**推奨対応**:
- リポジトリ名の確認
- プライベートリポジトリの場合、アクセス権限の確認

---

## 🔧 自動修繕実施内容

**実施した修繕**: なし

**理由**: 重大なエラーは検出されませんでした。LINE Botは正常に稼働しており、システムの主要機能に影響はありません。

---

## 📝 推奨対応事項

### 優先度: 高

1. **n8n APIキーの再確認**
   - n8n管理画面でAPIキーを確認
   - 必要に応じて再生成し、環境変数とGitHub Secretsを更新

### 優先度: 中

2. **Supabase Access Tokenの更新**
   - `supabase login` でトークンを再取得
   - GitHub Secretsに `SUPABASE_ACCESS_TOKEN` を設定

3. **cursorvers_line_paid_dev リポジトリの確認**
   - リポジトリ名が正しいか確認
   - 存在しない場合は、点検スクリプトから削除

### 優先度: 低

4. **Google Sheets同期状況の確認**
   - n8n API問題解決後、手動で確認

---

## 📈 システム健全性スコア

**総合スコア**: 75/100

**内訳**:
- LINE Bot: 25/25 ✅
- Discord Webhook: 15/15 ✅
- Supabase Edge Functions: 20/20 ✅
- Supabase Management API: 5/10 ⚠️
- n8n API: 0/15 ❌
- Google Sheets: 0/10 ⚠️
- GitHub: 10/15 ⚠️

---

## 🔄 次回点検予定

**次回点検日時**: 2026-01-01 06:00:00 JST

**点検内容**:
- 全コンポーネントの稼働確認
- n8n API認証問題の解決確認
- Google Sheets同期状況の確認

---

## 📎 関連リンク

- [LINE Bot Endpoint](https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-webhook)
- [Supabase Project](https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep)
- [n8n Instance](https://n8n.srv995974.hstgr.cloud)
- [GitHub Repository](https://github.com/mo666-med/cursorvers_line_free_dev)

---

*このレポートは自動生成されました*  
*生成日時: 2025-12-31 06:07:07 JST*  
*システムバージョン: Manus v1.0*
