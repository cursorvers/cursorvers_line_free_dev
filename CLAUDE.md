# cursorvers_line_free_dev - Claude Code Context

## プロジェクト概要

**cursorvers_line_free_dev** - LINE友だち登録・決済・Discord連携システム

Supabase Edge Functions + GitHub Actions による自動運用システム

## 技術スタック

- **Backend**: Supabase Edge Functions (Deno)
- **Database**: Supabase (PostgreSQL)
- **CI/CD**: GitHub Actions
- **決済**: Stripe
- **通知**: LINE Messaging API, Discord Webhook
- **監視**: Manus自動監査システム

## ディレクトリ構成

```
cursorvers_line_free_dev/
├── .github/workflows/     # GitHub Actions ワークフロー
│   ├── deploy-supabase.yml    # Edge Functions デプロイ
│   ├── manus-audit-daily.yml  # 日次監査（毎朝6時JST）
│   └── ...
├── supabase/functions/    # Edge Functions
│   ├── line-webhook/          # LINE Webhook受信
│   ├── line-daily-brief/      # LINE日次配信
│   ├── line-register/         # LINE友だち登録
│   ├── stripe-webhook/        # Stripe決済Webhook
│   ├── create-checkout-session/ # 決済セッション作成
│   ├── discord-bot/           # Discord Bot
│   ├── manus-audit-line-daily-brief/ # 監査機能
│   ├── health-check/          # ヘルスチェック
│   ├── relay/                 # イベント中継
│   ├── stats-exporter/        # 統計エクスポート
│   ├── ingest-hij/            # データ取り込み
│   ├── generate-sec-brief/    # セキュリティブリーフ生成
│   └── _shared/               # 共通モジュール
├── scripts/               # 運用スクリプト
│   ├── daily-check.sh         # 日次点検スクリプト
│   └── auto-fix/              # 自動修繕スクリプト
├── config/                # 設定ファイル
│   └── audit-config.yaml      # 監査設定
└── docs/                  # ドキュメント
    └── logs/                  # 日次点検ログ
```

## 主要機能

### 1. LINE友だち登録システム
- `line-register`: LIFF経由の友だち登録
- `line-webhook`: LINE Webhookイベント処理
- `line-daily-brief`: 日次カード配信

### 2. Stripe決済連携
- `create-checkout-session`: 決済セッション作成
- `stripe-webhook`: 決済完了Webhook処理
- Discord招待リンク自動発行

### 3. 監視・監査システム
- 毎朝6時JSTに自動監査実行
- カード在庫・配信成功率チェック
- エラー時はManus APIで自動修繕タスク作成
- Discord/LINE通知

## 環境変数

### Supabase Secrets
```bash
# 必須
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET
STRIPE_API_KEY
STRIPE_WEBHOOK_SECRET
DISCORD_BOT_TOKEN
DISCORD_GUILD_ID

# オプション
MANUS_API_KEY
DISCORD_ADMIN_WEBHOOK_URL
GOOGLE_SA_JSON
```

### GitHub Secrets
```bash
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
N8N_API_KEY
N8N_INSTANCE_URL
```

## 開発コマンド

```bash
# Edge Functions デプロイ
npx supabase functions deploy <function-name> --project-ref haaxgwyimoqzzxzdaeep

# 日次監査手動実行
gh workflow run manus-audit-daily.yml

# 全関数デプロイ
gh workflow run "Deploy Supabase Edge Functions"
```

## カスタムスラッシュコマンド

- `/test` - テスト実行
- `/deploy` - デプロイ実行
- `/verify` - システム動作確認
- `/miyabi-status` - プロジェクトステータス確認

## 監査スケジュール

| ワークフロー | スケジュール | 内容 |
|------------|-------------|------|
| manus-audit-daily | 毎日6:00 JST | カード在庫・配信成功率 |
| manus-audit-weekly | 毎週月曜 | 詳細監査 |
| manus-audit-monthly | 毎月1日 | DBメンテナンス |

## トラブルシューティング

### LINE Bot応答なし
```bash
npx supabase functions deploy line-webhook --project-ref haaxgwyimoqzzxzdaeep
```

### Discord通知が届かない
1. `DISCORD_ADMIN_WEBHOOK_URL` を確認
2. Webhook URLが有効か確認

### デプロイ失敗
```bash
gh run list --workflow "Deploy Supabase Edge Functions" --limit 3
gh run view <run-id> --log
```
