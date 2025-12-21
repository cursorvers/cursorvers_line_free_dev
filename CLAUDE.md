# cursorvers_line_free_dev - Claude Code Context

## プロジェクト概要

**cursorvers_line_free_dev** - LINE友だち登録・決済・Discord連携システム

Supabase Edge Functions + GitHub Actions による自動運用システム

## 現在のステータス

| 項目 | 状態 |
|-----|------|
| **lint** | ✅ 0 warnings (clean) |
| **テスト** | ✅ 280件 pass (545 steps) |
| **CI/CD** | ✅ Auto-Fix + Full Test Suite |
| **総合評価** | ✅ 9.5/10 |

## 技術スタック

- **Runtime**: Deno v2.x
- **Backend**: Supabase Edge Functions
- **Database**: Supabase (PostgreSQL)
- **CI/CD**: GitHub Actions
- **決済**: Stripe
- **通知**: LINE Messaging API, Discord Webhook
- **監視**: Manus自動監査システム

## ディレクトリ構成

```
cursorvers_line_free_dev/
├── .github/workflows/         # GitHub Actions
│   ├── ci-tests.yml              # Lint/Format/Test
│   ├── auto-fix.yml              # 自動フォーマット
│   ├── deploy-supabase.yml       # デプロイ
│   ├── manus-audit-daily.yml     # 日次監査
│   └── ...
├── supabase/functions/        # Edge Functions
│   ├── _shared/                  # 共通モジュール
│   ├── line-webhook/             # LINE Webhook
│   ├── line-daily-brief/         # 日次配信
│   ├── line-register/            # 友だち登録
│   ├── stripe-webhook/           # Stripe決済
│   ├── discord-bot/              # Discord Bot
│   ├── manus-audit-line-daily-brief/  # 監査
│   └── deno.json                 # Import Map設定
├── scripts/                   # 運用スクリプト
├── orchestration/             # Manus連携
│   ├── PlanDelta.json            # 進捗状態
│   └── MANUS_EXECUTION_BRIEF_v2.0.txt
├── config/                    # 設定ファイル
└── docs/                      # ドキュメント
```

## 主要機能

### 1. LINE友だち登録システム
- `line-register`: LIFF経由の友だち登録
- `line-webhook`: Webhookイベント処理（診断フロー対応）
- `line-daily-brief`: 日次カード配信

### 2. Stripe決済連携
- `create-checkout-session`: 決済セッション作成
- `stripe-webhook`: 決済完了処理 + Discord招待発行

### 3. 監視・監査システム
- 日次/週次/月次の自動監査
- カード在庫・配信成功率チェック
- Manus API連携で自動修繕タスク作成

## 開発コマンド

```bash
# ローカル開発
cd supabase/functions
deno test --no-check --allow-env --allow-net --allow-read  # テスト
deno lint                                                    # lint
deno fmt                                                     # フォーマット

# デプロイ
npx supabase functions deploy <function-name> --project-ref haaxgwyimoqzzxzdaeep

# ワークフロー実行
gh workflow run ci-tests.yml      # CI実行
gh workflow run auto-fix.yml      # 自動修正
gh workflow run deploy-supabase   # デプロイ
```

## Import Map (deno.json)

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.43.1?target=deno",
    "stripe": "https://esm.sh/stripe@14.21.0?target=deno",
    "tweetnacl": "https://esm.sh/tweetnacl@1.0.3?target=deno",
    "std-assert": "https://deno.land/std@0.210.0/assert/mod.ts",
    "std-mock": "https://deno.land/std@0.210.0/testing/mock.ts"
  }
}
```

## 環境変数

### Supabase Secrets (必須)
```bash
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET
STRIPE_API_KEY
STRIPE_WEBHOOK_SECRET
DISCORD_BOT_TOKEN
DISCORD_GUILD_ID
```

### Supabase Secrets (オプション)
```bash
MANUS_API_KEY
DISCORD_ADMIN_WEBHOOK_URL
GOOGLE_SA_JSON
OPENAI_API_KEY
```

### GitHub Secrets
```bash
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
```

## CI/CDワークフロー

| ワークフロー | トリガー | 内容 |
|------------|---------|------|
| `ci-tests.yml` | push/PR | Lint, Format, Test (143件) |
| `auto-fix.yml` | push to main | 自動フォーマット修正 |
| `deploy-supabase.yml` | 手動/push | Edge Functions デプロイ |
| `manus-audit-daily.yml` | 毎日6:00 JST | カード在庫・配信成功率 |

## 監査スケジュール

| ワークフロー | スケジュール | 内容 |
|------------|-------------|------|
| manus-audit-daily | 毎日6:00 JST | カード在庫・配信成功率 |
| manus-audit-weekly | 毎週月曜 | 詳細監査 |
| manus-audit-monthly | 毎月1日 | DBメンテナンス |

## カスタムスラッシュコマンド

- `/test` - テスト実行
- `/deploy` - デプロイ実行
- `/verify` - システム動作確認
- `/miyabi-status` - プロジェクトステータス確認

## トラブルシューティング

### LINE Bot応答なし
```bash
npx supabase functions deploy line-webhook --project-ref haaxgwyimoqzzxzdaeep
npx supabase functions logs line-webhook --project-ref haaxgwyimoqzzxzdaeep
```

### テスト失敗
```bash
cd supabase/functions
deno test --no-check --allow-env --allow-net --allow-read
```

### lint警告が出る
```bash
cd supabase/functions
deno fmt    # フォーマット
deno lint   # lint確認
```

### デプロイ失敗
```bash
gh run list --workflow "Deploy Supabase Edge Functions" --limit 3
gh run view <run-id> --log
```

## 最近の更新 (2025-12)

- ✅ Import Map導入（deno.json拡張）
- ✅ lint clean達成（0 warnings）
- ✅ CI/CD強化（全テスト + Auto-Fix）
- ✅ Manus API連携実装
- ✅ README.md全面改訂
- ✅ 孤児レコードマージ機能追加（LINE登録→有料決済時の重複解消）
- ✅ merge-utils.ts + テスト追加（280テスト達成）
