# 📊 Cursorvers 日次システム点検レポート

**日時**: 2026-01-03 16:07:00 UTC (2026-01-04 01:07:00 JST)

---

## 点検結果サマリー

| コンポーネント | ステータス | 詳細 |
|--------------|----------|------|
| ✅ LINE Bot | **正常** | Edge Function稼働中 |
| ⚠️ Discord Webhook | **未設定** | 環境変数が未設定 |
| ⚠️ Supabase | **認証必要** | ログ確認には認証が必要 |
| ⚠️ n8n | **確認制限** | API経由での状態確認不可 |
| ✅ GitHub (free_dev) | **正常** | 最新コミット確認完了 |
| ❌ GitHub (paid_dev) | **リポジトリ不在** | アクセス不可 |

---

## 詳細点検結果

### 1. LINE Bot (Supabase Edge Functions)

**エンドポイント**: `https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-webhook`

**点検方法**: 
```bash
curl -X GET "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-webhook"
```

**結果**:
- **HTTPステータス**: 200 OK
- **レスポンス**: "OK - line-webhook is running"
- **判定**: ✅ **正常稼働**

LINE Botは正常に稼働しており、ヘルスチェックに成功しています。

---

### 2. Discord Webhook

**点検結果**: ⚠️ **環境変数未設定**

**詳細**:
- `DISCORD_WEBHOOK_URL` 環境変数が設定されていません
- ユーザーから提供されたのは招待リンク (`https://discord.gg/AnqkRuS5`) であり、Webhook URLではありません

**推奨アクション**:
1. Discordサーバーの設定 → 連携サービス → ウェブフック
2. 新しいウェブフックを作成
3. Webhook URL (`https://discord.com/api/webhooks/...`) を環境変数に設定

---

### 3. Supabase

**プロジェクトID**: `haaxgwyimoqzzxzdaeep`

**点検結果**: ⚠️ **認証が必要**

**詳細**:
- Supabase MCP経由でEdge Functionsのログ確認を試みましたが、認証エラーが発生しました
- エラーメッセージ: "Unauthorized. Please provide a valid access token to the MCP server via the --access-token flag or SUPABASE_ACCESS_TOKEN."

**推奨アクション**:
- Supabaseアクセストークンを環境変数 `SUPABASE_ACCESS_TOKEN` に設定することで、ログの自動確認が可能になります

---

### 4. n8n Workflow

**インスタンスURL**: `${N8N_INSTANCE_URL}`

**点検結果**: ⚠️ **API経由での状態確認不可**

**詳細**:
- n8n APIエンドポイント (`/api/v1/executions`) へのリクエストがWeb UIのHTMLを返しました
- APIキーは設定されていますが、エンドポイントがWeb UIにリダイレクトされている可能性があります

**推奨アクション**:
- n8nのAPI設定を確認し、REST APIエンドポイントが正しく有効化されているか確認してください
- または、n8nのWeb UIから手動でワークフロー実行状態を確認してください

---

### 5. GitHub リポジトリ

#### 5.1 cursorvers_line_free_dev

**リポジトリ**: `mo666-med/cursorvers_line_free_dev`

**点検結果**: ✅ **正常**

**最新コミット情報**:
- **コミットハッシュ**: `3247ef4384823fcc7b158285b6a9c9005bc46b25`
- **作成者**: masayuki.O
- **日時**: 2026-01-03 09:42:28 +0900
- **メッセージ**: "docs: Manus役割分担を明確化"

リポジトリは正常にアクセス可能で、最新のコミットが確認できました。

#### 5.2 cursorvers_line_paid_dev

**リポジトリ**: `mo666-med/cursorvers_line_paid_dev`

**点検結果**: ❌ **リポジトリが見つかりません**

**詳細**:
- GitHub CLIでのクローン試行時にエラーが発生しました
- エラーメッセージ: "GraphQL: Could not resolve to a Repository with the name 'mo666-med/cursorvers_line_paid_dev'."

**推奨アクション**:
- リポジトリが削除されたか、名前が変更された可能性があります
- または、アクセス権限が付与されていない可能性があります
- 今後の監査対象から除外することを推奨します

---

## 自動修繕の実施

**修繕の必要性**: なし

**理由**:
- LINE Bot Edge Functionは正常に稼働しており、エラーは検出されませんでした
- その他のコンポーネントは設定不足や認証の問題であり、自動修繕の対象ではありません

---

## 推奨事項

1. **Discord Webhook URLの設定**: システム報告を自動化するため、Webhook URLを環境変数に設定してください
2. **Supabaseアクセストークンの設定**: Edge Functionsのログを自動確認するため、アクセストークンを設定してください
3. **n8n API設定の確認**: ワークフロー実行状態を自動確認するため、REST APIが正しく有効化されているか確認してください
4. **paid_devリポジトリの監査対象除外**: リポジトリが存在しないため、今後の監査対象から除外してください

---

## 次回点検予定

**次回実行日時**: 2026-01-04 04:00:00 JST (毎日午前4時)

**報告日時**: 2026-01-04 06:00:00 JST (毎日午前6時)

---

**レポート作成者**: Manus (自動システム点検)
