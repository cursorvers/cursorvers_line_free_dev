# GitHub Actions 自動点検セットアップガイド

**作成日**: 2025-12-14  
**対象リポジトリ**: `mo666-med/cursorvers_line_free_dev`

---

## 🎯 概要

このガイドでは、GitHub Actionsを使って毎日自動的にシステム点検を実行し、結果をDiscordに通知する設定方法を説明します。

**実行スケジュール**: 毎日19:00 UTC（04:00 JST）

---

## 📋 前提条件

- GitHubリポジトリへのアクセス権限（Settings → Secrets）
- Supabase Service Role Key
- n8n API Key
- Discord Webhook URL（オプション）

---

## 🔐 ステップ1: GitHub Secretsの設定

### 1.1 GitHub Secretsページにアクセス

```
https://github.com/mo666-med/cursorvers_line_free_dev/settings/secrets/actions
```

### 1.2 必要なSecretsを追加

以下のSecretsを「New repository secret」ボタンから追加してください：

#### 必須

| Name | Value | 取得方法 |
|------|-------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | [Supabaseダッシュボード](https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep/settings/api) → Service Role Key |
| `N8N_API_KEY` | `n8n_api_...` | n8nダッシュボード → Settings → API Keys |
| `N8N_INSTANCE_URL` | `https://n8n.srv995974.hstgr.cloud` | n8nインスタンスのURL |

#### オプション

| Name | Value | 説明 |
|------|-------|------|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | `{"type":"service_account",...}` | Google Sheets詳細確認用（現在未使用） |

**注意**: Discord Webhook URLはスクリプト内にハードコードされているため、Secretsに追加する必要はありません。

---

## 📝 ステップ2: GitHub Actionsワークフローの作成

### 2.1 ワークフローファイルを作成

リポジトリのルートディレクトリに以下のファイルを作成してください：

**ファイルパス**: `.github/workflows/daily-check.yml`

**内容**:

```yaml
name: Daily System Check

on:
  # 毎日19:00 UTC (04:00 JST)に実行
  schedule:
    - cron: '0 19 * * *'
  
  # 手動実行も可能
  workflow_dispatch:

permissions:
  contents: write  # ログファイルをコミットするために必要

jobs:
  system-check:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Run daily system check
        env:
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          N8N_API_KEY: ${{ secrets.N8N_API_KEY }}
          N8N_INSTANCE_URL: ${{ vars.N8N_INSTANCE_URL }}
        run: |
          chmod +x ./scripts/daily-check.sh
          ./scripts/daily-check.sh
      
      - name: Commit and push logs
        run: |
          git config user.name "GitHub Actions Bot"
          git config user.email "actions@github.com"
          git add docs/logs/
          git diff --staged --quiet || git commit -m "docs: Add daily system check log ($(date -u +%Y-%m-%d))"
          git push
        continue-on-error: true
```

### 2.2 ファイルをコミット・プッシュ

```bash
cd /path/to/cursorvers_line_free_dev
git add .github/workflows/daily-check.yml
git commit -m "ci: GitHub Actions自動点検ワークフローを追加"
git push origin main
```

---

## 🧪 ステップ3: 動作確認

### 3.1 手動実行でテスト

1. GitHubリポジトリの「Actions」タブにアクセス
   ```
   https://github.com/mo666-med/cursorvers_line_free_dev/actions
   ```

2. 左サイドバーから「Daily System Check」を選択

3. 「Run workflow」ボタンをクリック

4. 「Run workflow」を再度クリックして実行

### 3.2 実行結果を確認

1. ワークフローの実行が完了したら、ログを確認
2. Discordに通知が届いているか確認
3. `docs/logs/`ディレクトリに新しいログファイルが作成されているか確認

---

## 📊 期待される結果

### 成功時

**GitHub Actions Log**:
```
==========================================
Cursorvers システム点検スクリプト v3.0
==========================================

🔍 1. LINE Bot稼働確認...
✅ LINE Bot: 正常稼働中

🔍 2. Discord Webhook接続確認...
✅ Discord Webhook: 接続成功

🔍 3. Supabaseデータ保全確認...
✅ Supabase: データ保全確認済み
   users: 123件
   members: 45件
   interaction_logs: 678件

🔍 4. n8nワークフロー状態確認...
✅ n8n: 2つのワークフローがアクティブ

🔍 5. GitHubリポジトリ確認...
✅ GitHub: 最新コミット確認済み

==========================================
📊 システム健全性スコア: 100/100 (優秀)
==========================================
```

**Discord通知**:
```
🤖 Cursorvers システム点検レポート

📅 点検日時: 2025-12-14 04:00:00 JST
📊 システムスコア: 100/100 (優秀)

✅ LINE Bot: 正常稼働中
✅ Discord Webhook: 接続成功
✅ Supabase: データ保全確認済み (users: 123件, members: 45件)
✅ n8n: 2つのワークフローがアクティブ
✅ GitHub: 最新コミット確認済み

🎉 全項目で問題なし！
```

**GitHubコミット**:
- `docs/logs/daily-check-2025-12-14.md`が自動的にコミット・プッシュされる

---

## 🔧 トラブルシューティング

### 問題1: ワークフローが実行されない

**原因**: GitHub Secretsが設定されていない

**解決方法**:
1. `https://github.com/mo666-med/cursorvers_line_free_dev/settings/secrets/actions`にアクセス
2. 必要なSecretsが全て設定されているか確認

### 問題2: Supabaseデータ確認でエラー

**原因**: `SUPABASE_SERVICE_ROLE_KEY`が間違っている

**解決方法**:
1. Supabaseダッシュボードで正しいService Role Keyを取得
2. GitHub Secretsを更新

### 問題3: Discord通知が届かない

**原因**: Discord Webhook URLが無効

**解決方法**:
1. `scripts/daily-check.sh`内のWebhook URLを確認
2. Discordサーバーで新しいWebhookを作成

### 問題4: ログファイルがコミットされない

**原因**: GitHub Actionsの権限不足

**解決方法**:
1. `.github/workflows/daily-check.yml`に`permissions: contents: write`が設定されているか確認
2. リポジトリの Settings → Actions → General → Workflow permissions を「Read and write permissions」に変更

---

## 📅 スケジュール変更

実行時刻を変更したい場合は、`.github/workflows/daily-check.yml`の`cron`を編集してください。

**例**:
```yaml
# 毎日12:00 UTC (21:00 JST)に実行
- cron: '0 12 * * *'

# 毎週月曜日の09:00 UTC (18:00 JST)に実行
- cron: '0 9 * * 1'
```

**cron形式**:
```
分 時 日 月 曜日
*  *  *  *  *
```

---

## 🚀 次のステップ

1. ✅ GitHub Secretsを設定
2. ✅ GitHub Actionsワークフローを作成
3. ✅ 手動実行でテスト
4. ⏳ 本番運用開始（翌日19:00 UTCに自動実行）

---

## 📞 サポート

問題が解決しない場合は、以下の情報を提供してください：

1. GitHub Actions実行ログ
2. エラーメッセージ
3. 設定したSecretsの名前（値は不要）

---

*このガイドは自動生成されました。*
