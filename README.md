# Cursorvers LINE Platform

医療AI教育プラットフォーム「Cursorvers」のLINE Bot + Stripe決済 + Discord連携システム

[![CI Tests](https://github.com/mo666-med/cursorvers_line_free_dev/actions/workflows/test-line-webhook.yml/badge.svg)](https://github.com/mo666-med/cursorvers_line_free_dev/actions/workflows/test-line-webhook.yml)
[![Deploy](https://github.com/mo666-med/cursorvers_line_free_dev/actions/workflows/deploy-supabase.yml/badge.svg)](https://github.com/mo666-med/cursorvers_line_free_dev/actions/workflows/deploy-supabase.yml)

## 概要

LINE Official Accountを通じて医療AI教育コンテンツを配信し、Stripe決済でプレミアムコースへのアップグレード、Discord連携でコミュニティ参加を実現するシステムです。

### 主要機能

| 機能 | 説明 |
|------|------|
| **LINE Bot** | 診断フロー、Risk Checker、Prompt Polisher |
| **Stripe決済** | サブスクリプション決済、Webhook処理 |
| **Discord連携** | 有料会員向けコミュニティ招待 |
| **自動監査** | 日次/週次/月次の自動監査・修繕 |
| **Auto-Fix CI** | フォーマットエラーの自動修正 |

---

## クイックスタート

### 前提条件

- [Deno](https://deno.land/) v1.40+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [GitHub CLI](https://cli.github.com/)

### ローカル開発

```bash
# リポジトリをクローン
git clone https://github.com/mo666-med/cursorvers_line_free_dev.git
cd cursorvers_line_free_dev

# テスト実行
deno test supabase/functions/line-webhook/test/ --allow-env --allow-net

# フォーマット & Lint
deno fmt supabase/functions/
deno lint supabase/functions/

# Edge Functionをローカル起動
supabase start
supabase functions serve line-webhook --env-file .env.local
```

### デプロイ

```bash
# 全Edge Functionsをデプロイ
gh workflow run "Deploy Supabase Edge Functions"

# 個別デプロイ
supabase functions deploy line-webhook --project-ref haaxgwyimoqzzxzdaeep
```

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                         LINE Platform                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [LINE User] ──→ [LINE Webhook] ──→ [Supabase Edge Functions]  │
│                                              │                  │
│                    ┌─────────────────────────┼──────────────┐   │
│                    │                         ▼              │   │
│                    │   ┌─────────────────────────────────┐  │   │
│                    │   │         line-webhook            │  │   │
│                    │   │  ├─ Risk Checker (GPT-4o)       │  │   │
│                    │   │  ├─ Prompt Polisher (GPT-4o)    │  │   │
│                    │   │  ├─ Diagnosis Flow              │  │   │
│                    │   │  └─ Course Router               │  │   │
│                    │   └─────────────────────────────────┘  │   │
│                    │                         │              │   │
│  [Stripe] ◄───────►│   stripe-webhook        │              │   │
│                    │         │               ▼              │   │
│  [Discord] ◄──────►│   discord-bot    [Supabase DB]        │   │
│                    │                                        │   │
│                    └────────────────────────────────────────┘   │
│                                                                 │
│  [GitHub Actions] ──→ Auto-Fix / Audit / Deploy                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ディレクトリ構成

```
.
├── .github/workflows/           # GitHub Actions
│   ├── test-line-webhook.yml    # CI/CD + Auto-Fix
│   ├── deploy-supabase.yml      # Edge Functions デプロイ
│   ├── manus-audit-daily.yml    # 日次監査
│   ├── manus-progress.yml       # Manus進捗ハンドラ
│   └── line-event.yml           # LINEイベントハンドラ
│
├── supabase/functions/          # Edge Functions
│   ├── line-webhook/            # LINE Bot メイン
│   │   ├── index.ts             # エントリーポイント
│   │   ├── lib/                 # ビジネスロジック
│   │   │   ├── risk-checker.ts  # リスクチェッカー
│   │   │   ├── prompt-polisher.ts # プロンプト改善
│   │   │   ├── diagnosis-flow.ts  # 診断フロー
│   │   │   └── course-router.ts   # コース分岐
│   │   └── test/                # テスト
│   ├── stripe-webhook/          # Stripe決済処理
│   ├── line-daily-brief/        # 日次カード配信
│   ├── line-register/           # LIFF友だち登録
│   ├── discord-bot/             # Discord Bot
│   └── _shared/                 # 共有モジュール
│       ├── supabase.ts          # DBクライアント
│       ├── logger.ts            # 構造化ログ
│       ├── manus-api.ts         # Manus API
│       └── retry.ts             # リトライロジック
│
├── orchestration/               # Manus連携
│   ├── plan/                    # Plan JSON
│   └── MANUS_EXECUTION_BRIEF_v2.0.txt
│
├── scripts/                     # 運用スクリプト
│   ├── manus-api.js             # Manus API (Node.js)
│   ├── daily-check.sh           # 日次点検
│   └── auto-fix/                # 自動修繕
│
├── docs/                        # ドキュメント
│   ├── logs/                    # 監査ログ
│   └── MANUS_AUTOMATION.md      # 自動化ガイド
│
└── config/                      # 設定
    └── audit-config.yaml        # 監査設定
```

---

## Edge Functions

| 関数名 | 説明 | トリガー |
|--------|------|----------|
| `line-webhook` | LINE Webhook受信・応答 | LINE Platform |
| `stripe-webhook` | Stripe決済Webhook | Stripe |
| `line-daily-brief` | 日次カード配信 | Cron (GitHub Actions) |
| `line-register` | LIFF友だち登録 | LIFF |
| `discord-bot` | Discord連携 | Discord API |
| `relay` | GitHub Actions連携 | repository_dispatch |
| `health-check` | ヘルスチェック | 監視システム |

---

## GitHub Actions ワークフロー

### CI/CD

| ワークフロー | トリガー | 説明 |
|-------------|---------|------|
| `test-line-webhook.yml` | push/PR | テスト + Auto-Fix |
| `deploy-supabase.yml` | push to main | Edge Functionsデプロイ |
| `ci-tests.yml` | PR | 型チェック・Lint |

### 監査・自動化

| ワークフロー | スケジュール | 説明 |
|-------------|-------------|------|
| `manus-audit-daily.yml` | 毎日 06:00 JST | 日次監査 |
| `manus-audit-weekly.yml` | 毎週月曜 | 週次監査 |
| `manus-audit-monthly.yml` | 毎月1日 | 月次メンテナンス |
| `manus-progress.yml` | repository_dispatch | Manus進捗処理 |

### Auto-Fix 機能

フォーマットエラーを自動修正し、`🤖 [auto-fix]` コミットを作成：

```
push → format-check → Auto-Fix Job → 🤖 [auto-fix] commit
```

---

## 環境変数

### Supabase Secrets

```bash
# 必須
SUPABASE_URL=https://haaxgwyimoqzzxzdaeep.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
STRIPE_API_KEY=...
STRIPE_WEBHOOK_SECRET=...
OPENAI_API_KEY=...

# オプション
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
MANUS_API_KEY=...
```

### GitHub Secrets

```bash
SUPABASE_ACCESS_TOKEN=...
SUPABASE_PROJECT_ID=haaxgwyimoqzzxzdaeep
DISCORD_ADMIN_WEBHOOK_URL=...
```

---

## テスト

```bash
# 全テスト実行
deno test supabase/functions/line-webhook/test/ --allow-env --allow-net

# 特定テスト実行
deno test supabase/functions/line-webhook/test/risk-checker.test.ts --allow-env --allow-net

# カバレッジ
deno test --coverage=coverage/ supabase/functions/line-webhook/test/
deno coverage coverage/
```

### テスト構成

- `risk-checker.test.ts`: Risk Checker機能
- `prompt-polisher.test.ts`: Prompt Polisher機能
- `diagnosis-flow.test.ts`: 診断フロー
- `note-recommendations.test.ts`: 記事推薦

---

## 運用コマンド

```bash
# ヘルスチェック
curl https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/health-check

# ログ確認
supabase functions logs line-webhook --project-ref haaxgwyimoqzzxzdaeep

# 手動監査
gh workflow run manus-audit-daily.yml

# Edge Function再デプロイ
supabase functions deploy line-webhook --project-ref haaxgwyimoqzzxzdaeep
```

---

## トラブルシューティング

### LINE Bot応答なし

```bash
# 1. ログ確認
supabase functions logs line-webhook --project-ref haaxgwyimoqzzxzdaeep

# 2. 再デプロイ
supabase functions deploy line-webhook --project-ref haaxgwyimoqzzxzdaeep
```

### Stripe Webhook失敗

```bash
# 署名検証確認
supabase secrets list --project-ref haaxgwyimoqzzxzdaeep | grep STRIPE
```

### テスト失敗

```bash
# ローカルでテスト実行
deno test supabase/functions/line-webhook/test/ --allow-env --allow-net

# 型チェック
deno check supabase/functions/line-webhook/index.ts
```

---

## ライセンス

MIT License

---

## 連絡先

- GitHub: [@mo666-med](https://github.com/mo666-med)
- LINE Official Account: @529ybhfo
- Discord: [Cursorvers Community](https://discord.gg/TkmmX5Z4vx)
