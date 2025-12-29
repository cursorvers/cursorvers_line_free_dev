# 📊 Cursorvers 日次システム点検レポート

**日時**: 2025-12-30 06:05 JST

---

## システム稼働状況

### ✅ LINE Bot
- **状態**: 正常稼働
- **エンドポイント**: `https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-webhook`
- **確認結果**: `OK - line-webhook is running`
- **詳細**: Supabase Edge Functions経由で正常にレスポンスを返却

### ⚠️ Discord Webhook
- **状態**: 未確認
- **理由**: Webhook URLが環境変数に設定されていない
- **提供情報**: 招待リンク (`https://discord.gg/AnqkRuS5`) のみ
- **推奨対応**: 実際のWebhook URL (`https://discord.com/api/webhooks/...`) の設定が必要

### ⚠️ Supabase
- **プロジェクトID**: `haaxgwyimoqzzxzdaeep`
- **状態**: 部分確認
- **確認済み**: Edge Functions稼働状況（正常）
- **未確認**: 詳細ログ（認証トークン未設定のため）
- **推奨対応**: `SUPABASE_ACCESS_TOKEN` の環境変数設定

### ⚠️ Google Sheets (n8nワークフロー経由)
- **状態**: 未確認
- **理由**: n8n API認証エラー
- **詳細**: APIエンドポイントがHTMLレスポンスを返却（認証情報の再確認が必要）
- **推奨対応**: n8n API_KEYとエンドポイントURLの確認

### ✅ GitHub リポジトリ

#### cursorvers_line_free_dev
- **状態**: 正常
- **最新コミット**: `ec628de`
- **コミットメッセージ**: fix: コードレビュー指摘事項の修正
- **コミット時刻**: 17時間前
- **コミッター**: masayuki.O

#### cursorvers_line_paid_dev
- **状態**: リポジトリ不存在
- **詳細**: GraphQL エラー - リポジトリが見つからない
- **推奨対応**: 監査対象から除外

---

## 自動修繕実施内容

**実施項目**: なし

**理由**: LINE Bot（主要システム）が正常稼働中のため、緊急の修繕は不要

---

## 推奨事項

1. **Discord Webhook URL の設定**
   - 環境変数 `DISCORD_WEBHOOK_URL` に実際のWebhook URLを設定
   - 形式: `https://discord.com/api/webhooks/{webhook_id}/{webhook_token}`

2. **Supabase Access Token の設定**
   - 環境変数 `SUPABASE_ACCESS_TOKEN` を設定してログ確認を可能にする
   - 取得方法: Supabase Dashboard > Settings > API > Personal Access Tokens

3. **n8n API認証情報の確認**
   - `N8N_API_KEY` と `N8N_INSTANCE_URL` の値を再確認
   - n8n管理画面でAPIキーが有効か確認

4. **監査対象の更新**
   - `cursorvers_line_paid_dev` リポジトリを監査対象から除外

---

## 次回点検予定

**日時**: 2025-12-31 06:00 JST

**点検項目**:
- LINE Bot稼働確認
- Discord Webhook接続テスト（設定完了後）
- Supabase Edge Functionsログ確認（トークン設定完了後）
- n8nワークフロー状態確認（認証情報確認後）
- GitHub最新コミット確認

---

*このレポートは自動生成されました*
