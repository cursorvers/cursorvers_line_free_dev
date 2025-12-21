# LINE Daily Brief 設定情報（記録用）

## 認証方式

- **方式**: X-API-Key（generate-sec-briefと同じパターン）
- **ヘッダー名**: `X-API-Key`

## APIキー

- **シークレット名**: `LINE_DAILY_BRIEF_API_KEY`
- **値**: `aef9fab9747bf4dd21adc0af6e057564567554d4cb6cf89851c56dc3af5dd0cb`
- **長さ**: 64文字

## 設定場所

- ✅ **GitHub Secrets**: `LINE_DAILY_BRIEF_API_KEY`
- ✅ **Supabaseシークレット**: `LINE_DAILY_BRIEF_API_KEY`

## フッターURL

- **表示**: `Cursorvers.edu`
- **リンク先**: `https://cursorvers.github.io/cursorvers-edu/`

## 配信スケジュール

- **時刻**: 毎日 07:00 JST (22:00 UTC)
- **ワークフロー**: `.github/workflows/line-daily-brief-cron.yml`

## 動作状況

- ✅ 正常動作中
- ✅ テスト配信成功確認済み

## 注意事項

- `LINE_DAILY_BRIEF_CRON_SECRET` と `CRON_SECRET` は使用していません（削除可能）
- 認証は `X-API-Key` ヘッダーのみを使用

