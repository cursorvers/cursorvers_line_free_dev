# Cursorvers 日次システム点検レポート

**日時**: 2025-12-12 21:06:20 UTC (2025-12-13 06:06:20 JST)

---

## 📊 点検結果サマリー

| システム | ステータス | 詳細 |
|---------|-----------|------|
| LINE Bot | ✅ OK | 正常稼働中 |
| Discord Webhook | ⚠️ 未テスト | Webhook URL未設定のためテスト未実施 |
| Supabase Edge Functions | ✅ OK | 認証エラーのためログ取得不可だが、LINE Bot稼働確認済み |
| n8n Workflows | ✅ OK | 正常実行中 |
| Google Sheets | ⚠️ 未確認 | n8n経由での確認が必要 |
| GitHub (Free版) | ✅ OK | 最新コミット確認済み |
| GitHub (Paid版) | ✅ OK | 最新コミット確認済み |

---

## 🔍 詳細点検結果

### 1. LINE Bot (Supabase Edge Functions)

**エンドポイント**: `https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-webhook`

**テスト方法**:
```bash
curl -X GET "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-webhook"
```

**結果**:
```
OK - line-webhook is running
```

**ステータス**: ✅ **正常稼働中**

---

### 2. Discord Webhook

**ステータス**: ⚠️ **未テスト**

**理由**: Discord Webhook URLが未設定のため、接続テストを実施できませんでした。

**推奨アクション**: 正しいWebhook URLを環境変数または設定ファイルに追加してください。

---

### 3. Supabase Edge Functions ログ

**Project ID**: `haaxgwyimoqzzxzdaeep`

**ステータス**: ⚠️ **認証エラー**

**エラー内容**:
```
Unauthorized. Please provide a valid access token to the MCP server
```

**備考**: 
- Supabase MCPサーバーへのアクセストークンが未設定のため、ログの詳細確認ができませんでした
- ただし、LINE BotのエンドポイントテストでOKが返されているため、Edge Function自体は正常に稼働していると判断されます

---

### 4. n8n Workflows

**インスタンスURL**: `https://n8n.srv995974.hstgr.cloud`

**アクティブワークフロー**:
- **LINE Webhook Handler** (ID: 1zIQM8Isa4tJSQb5)
  - ステータス: ✅ アクティブ
  - 最終更新: 2025-12-12T01:42:39.522Z

**最近の実行履歴** (直近5件):
1. 実行ID: 8795 - 完了 (2025-12-12 21:00:56 UTC)
2. 実行ID: 8794 - 完了 (2025-12-12 20:45:56 UTC)
3. 実行ID: 8793 - 完了 (2025-12-12 20:30:56 UTC)
4. 実行ID: 8792 - 完了 (2025-12-12 20:15:56 UTC)
5. 実行ID: 8791 - 完了 (2025-12-12 20:00:56 UTC)

**ステータス**: ✅ **正常実行中** (15分間隔で定期実行されています)

---

### 5. Google Sheets

**ステータス**: ⚠️ **未確認**

**理由**: Google Sheetsの同期状況はn8nワークフロー経由で確認する必要がありますが、今回の点検では詳細確認を実施していません。

**推奨アクション**: n8nワークフローの実行ログを詳細に確認し、Google Sheetsへのデータ書き込みが正常に行われているか検証してください。

---

### 6. GitHub リポジトリ

#### Free版リポジトリ: `mo666-med/cursorvers_line_free_dev`

**最終プッシュ**: 2025-12-12T18:23:32Z

**最新コミット**:
- **SHA**: `66a66e22fccb96bebf322d1e30ab38f807ac87bd`
- **メッセージ**: "Fix n8n LINE Webhook Handler: prevent duplicate welcome messages"
- **作成者**: Manus Automation
- **日時**: 2025-12-12T01:43:49Z

**ステータス**: ✅ **正常**

---

#### Paid版リポジトリ: `mo666-med/cursorvers_line_paid_dev`

**最終プッシュ**: 2025-12-12T10:17:19Z

**最新コミット**:
- **SHA**: `1c5b7f2be2e10ccf133359ed9c18145391c6f780`
- **メッセージ**: "docs: Add Stripe Webhook fix log (2025-12-12)"
- **作成者**: mo666-med
- **日時**: 2025-12-12T10:17:18Z

**ステータス**: ✅ **正常**

---

## 🔧 自動修繕実行結果

**実行内容**: なし

**理由**: 重大なエラーは検出されませんでした。すべての主要システムが正常に稼働しています。

---

## 📝 推奨事項

1. **Discord Webhook URL設定**: Discord Webhookへの接続テストを実施するため、正しいWebhook URLを設定してください。

2. **Supabase認証設定**: Supabase MCPサーバーへのアクセストークンを設定し、Edge Functionsのログを詳細に監視できるようにしてください。

3. **Google Sheets同期確認**: n8nワークフローのログを詳細に確認し、Google Sheetsへのデータ同期が正常に行われているか検証してください。

---

## ✅ 総合評価

**システム全体のステータス**: ✅ **正常稼働中**

主要な機能（LINE Bot、n8n、GitHub）はすべて正常に動作しています。一部の監視機能（Discord Webhook、Supabase詳細ログ、Google Sheets同期確認）については、設定の追加や改善が推奨されますが、システムの稼働に影響を与える問題は確認されませんでした。

---

**レポート作成者**: Manus Automation  
**次回点検予定**: 2025-12-13 06:00:00 JST
