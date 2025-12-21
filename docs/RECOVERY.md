# System Recovery Guide

システム障害時の復旧手順書。

---

## Quick Reference

| 障害 | 復旧コマンド |
|------|-------------|
| LINE Bot応答なし | `npx supabase functions deploy line-webhook --project-ref haaxgwyimoqzzxzdaeep` |
| Daily Brief配信停止 | `gh workflow run line-daily-brief-cron.yml` |
| Obsidian同期停止 | `gh workflow run sync-line-cards.yml` |
| CI/CD失敗 | `gh workflow run ci-tests.yml` |
| 全Edge Functions再デプロイ | `gh workflow run deploy-supabase.yml` |

---

## 1. LINE Bot 障害

### 症状
- LINEメッセージに応答しない
- Webhookエラーが発生

### 診断

```bash
# Edge Function ログ確認
npx supabase functions logs line-webhook --project-ref haaxgwyimoqzzxzdaeep

# ヘルスチェック
curl -X GET "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/health-check"
```

### 復旧手順

```bash
# 1. Edge Function 再デプロイ
npx supabase functions deploy line-webhook --project-ref haaxgwyimoqzzxzdaeep

# 2. 環境変数確認
npx supabase secrets list --project-ref haaxgwyimoqzzxzdaeep

# 3. 必要に応じて環境変数を再設定
npx supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=xxx --project-ref haaxgwyimoqzzxzdaeep
npx supabase secrets set LINE_CHANNEL_SECRET=xxx --project-ref haaxgwyimoqzzxzdaeep
```

### 確認

```bash
# LINE Messaging API テスト（自分に送信）
curl -X POST "https://api.line.me/v2/bot/message/push" \
  -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"YOUR_USER_ID","messages":[{"type":"text","text":"Test"}]}'
```

---

## 2. Daily Brief 配信障害

### 症状
- 07:00 JSTに配信されない
- Discord通知が来ない

### 診断

```bash
# ワークフロー実行履歴
gh run list --workflow "LINE Daily Brief" --limit 5

# Edge Function ログ
npx supabase functions logs line-daily-brief --project-ref haaxgwyimoqzzxzdaeep
```

### 復旧手順

```bash
# 1. 手動で配信実行
gh workflow run line-daily-brief-cron.yml

# 2. 失敗した場合、Edge Functionを直接呼び出し
curl -X POST "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-daily-brief" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"

# 3. カード在庫確認
# Supabase Dashboard → line_cards テーブル → status = 'ready' のカウント
```

### カード在庫不足の場合

```bash
# Obsidian同期を手動実行
gh workflow run "Sync Line Cards from Obsidian"

# または手動でカードを追加
# Supabase Dashboard → line_cards → Insert row
```

---

## 3. Obsidian同期障害

### 症状
- 新しいカードがSupabaseに追加されない
- sync-line-cards ワークフローが失敗

### 診断

```bash
# ワークフロー実行履歴
gh run list --workflow "Sync Line Cards from Obsidian" --limit 5

# 失敗したrunの詳細
gh run view <run-id> --log
```

### 復旧手順

```bash
# 1. ドライランでテスト
gh workflow run "Sync Line Cards from Obsidian" -f dry_run=true

# 2. 本実行
gh workflow run "Sync Line Cards from Obsidian"

# 3. Vault トークン確認
gh secret list | grep OBSIDIAN
```

### Vault リポジトリの問題

```bash
# Vault リポジトリの状態確認
gh repo view mo666-med/obsidian-pro-kit-for-market-vault

# discord-sync ワークフロー確認
gh run list --repo mo666-med/obsidian-pro-kit-for-market-vault --workflow discord-sync.yml --limit 3
```

---

## 4. Stripe 決済障害

### 症状
- 決済完了後のDiscord招待が届かない
- Webhook処理エラー

### 診断

```bash
# Edge Function ログ
npx supabase functions logs stripe-webhook --project-ref haaxgwyimoqzzxzdaeep

# Stripe Dashboard でWebhookイベント確認
# https://dashboard.stripe.com/webhooks
```

### 復旧手順

```bash
# 1. Edge Function 再デプロイ
npx supabase functions deploy stripe-webhook --project-ref haaxgwyimoqzzxzdaeep

# 2. Webhook Secret 確認・再設定
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx --project-ref haaxgwyimoqzzxzdaeep

# 3. 手動でDiscord招待を発行（緊急対応）
# Discord Dashboard → サーバー設定 → 招待 → 新規作成
```

---

## 5. GitHub Actions 障害

### CI/CD 失敗

```bash
# 最新のCI結果確認
gh run list --workflow "CI Tests" --limit 3

# 手動で再実行
gh workflow run ci-tests.yml

# 特定のrunを再実行
gh run rerun <run-id>
```

### デプロイ失敗

```bash
# デプロイ状況確認
gh run list --workflow "Deploy Supabase Edge Functions" --limit 3

# 手動デプロイ
gh workflow run deploy-supabase.yml

# または直接デプロイ
cd supabase/functions
npx supabase functions deploy --project-ref haaxgwyimoqzzxzdaeep
```

---

## 6. Manus 自動修繕障害

### 症状
- 監査でエラーが検出されたがManusタスクが作成されない
- 自動修繕が動かない

### 診断

```bash
# 監査ワークフロー確認
gh run list --workflow "Manus Audit (Daily)" --limit 3

# Edge Function ログ
npx supabase functions logs manus-audit-line-daily-brief --project-ref haaxgwyimoqzzxzdaeep
```

### 復旧手順

```bash
# 1. MANUS_API_KEY 確認
npx supabase secrets list --project-ref haaxgwyimoqzzxzdaeep | grep MANUS

# 2. 手動で監査実行
gh workflow run "Manus Audit (Daily)"

# 3. テストモードで確認
gh workflow run "Manus Audit (Daily)" -f test_mode=true
```

---

## 7. Discord Bot 障害

### 症状
- /join コマンドが動かない
- Bot がオフライン

### 診断

```bash
# Edge Function ログ
npx supabase functions logs discord-bot --project-ref haaxgwyimoqzzxzdaeep
```

### 復旧手順

```bash
# 1. Edge Function 再デプロイ
npx supabase functions deploy discord-bot --project-ref haaxgwyimoqzzxzdaeep

# 2. Discord Developer Portal で Interaction Endpoint URL 確認
# https://discord.com/developers/applications

# 3. 環境変数確認
npx supabase secrets list --project-ref haaxgwyimoqzzxzdaeep | grep DISCORD
```

---

## 8. 全システム復旧（災害復旧）

### 完全な再構築手順

```bash
# 1. リポジトリクローン
git clone https://github.com/mo666-med/cursorvers_line_free_dev.git
cd cursorvers_line_free_dev

# 2. Supabase CLI インストール
npm install -g supabase

# 3. Supabase にログイン
npx supabase login

# 4. 環境変数を設定（.env.example を参照）
npx supabase secrets set --project-ref haaxgwyimoqzzxzdaeep \
  SUPABASE_URL=https://haaxgwyimoqzzxzdaeep.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=xxx \
  LINE_CHANNEL_ACCESS_TOKEN=xxx \
  LINE_CHANNEL_SECRET=xxx \
  STRIPE_API_KEY=xxx \
  STRIPE_WEBHOOK_SECRET=xxx \
  DISCORD_BOT_TOKEN=xxx \
  DISCORD_PUBLIC_KEY=xxx \
  DISCORD_GUILD_ID=xxx \
  DISCORD_ROLE_ID=xxx \
  DISCORD_ADMIN_WEBHOOK_URL=xxx \
  MANUS_API_KEY=xxx

# 5. 全Edge Functions デプロイ
npx supabase functions deploy --project-ref haaxgwyimoqzzxzdaeep

# 6. データベースマイグレーション（必要な場合）
npx supabase db push --project-ref haaxgwyimoqzzxzdaeep

# 7. GitHub Secrets 設定
gh secret set SUPABASE_URL --body "https://haaxgwyimoqzzxzdaeep.supabase.co"
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "xxx"
# ... 他のSecrets

# 8. GitHub Actions 有効化確認
gh workflow list

# 9. 動作確認
gh workflow run ci-tests.yml
gh workflow run "Manus Audit (Daily)" -f test_mode=true
```

---

## 9. バックアップからの復元

### データベースバックアップ

Supabase Dashboard から:
1. Settings → Database → Backups
2. 適切な時点を選択
3. Restore をクリック

### コードバックアップ

```bash
# 特定のコミットに戻す
git checkout <commit-hash>

# または特定の日付のバックアップタグ
git checkout backup-2025-12-21

# 強制プッシュ（注意: 履歴が失われる）
git push --force origin main
```

---

## 連絡先

| 役割 | 連絡先 |
|------|--------|
| システム管理者 | Discord #admin-channel |
| 緊急連絡 | LINE公式アカウント管理者 |
| Supabase サポート | https://supabase.com/support |

---

## 改訂履歴

| 日付 | 変更内容 |
|------|---------|
| 2025-12-21 | 初版作成 |
