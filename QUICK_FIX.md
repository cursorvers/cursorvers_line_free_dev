# LINE Daily Brief クイック修正手順

## 実施した変更

### 1. GitHub Actionsワークフロー
- `X-CRON-SECRET` → `Authorization: Bearer` に変更
- `SUPABASE_SERVICE_ROLE_KEY` を使用

### 2. Edge Function
- `LINE_DAILY_BRIEF_CRON_SECRET` のみを使用

## 手動実行手順

### ステップ1: コミット・プッシュ
```bash
cd /Users/masayuki/Cursorvers_HTML/cursorvers_line_stripe_discord
git add .github/workflows/line-daily-brief-cron.yml supabase/functions/line-daily-brief/index.ts docs/LINE_DAILY_BRIEF_FIX.md
git commit -m "fix: Use service role key instead of CRON_SECRET"
git push origin main
```

### ステップ2: 直接テスト（サービスロールキーで）
```bash
curl -X POST \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-daily-brief"
```

### ステップ3: GitHub Actionsでテスト
- GitHubリポジトリ → Actions → LINE Daily Brief → Run workflow

## 確認事項
- GitHub Secretsに `SUPABASE_SERVICE_ROLE_KEY` が設定されているか確認

