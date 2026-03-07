# Secret Plane 設定ガイド

このドキュメントでは、Cursorvers システムの secret を `GitHub Actions secrets` と `platform runtime secrets` に分離して管理する方法を説明します。

## 基本方針

- `GitHub secrets`: CI/CD と workflow dispatch 用
- `platform secrets`: Supabase Edge Functions や runtime が読む正本
- repo 内 `.env` は正本にしない

## Secret Plane

| Plane | 置き場所 | 用途 | 例 |
|---|---|---|---|
| GitHub Org/Repo/Environment Secrets | GitHub Actions | 監査、デプロイ、workflow 実行 | `MANUS_GITHUB_TOKEN`, `MANUS_AUDIT_API_KEY`, `SUPABASE_ACCESS_TOKEN` |
| Platform Runtime Secrets | Supabase / Cloudflare / Vercel | 本番実行時の `Deno.env.get(...)` / runtime env | `SUPABASE_SERVICE_ROLE_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `MANUS_API_KEY` |
| Local bootstrap | shell env / repo外 env file | one-shot import only | `export MANUS_GITHUB_TOKEN=...` |

---

## 📋 GitHub Actions Secrets

### 1. Discord Webhook関連

#### `DISCORD_ADMIN_WEBHOOK_URL`
- **用途**: システム監査、エラー通知、日次レポート送信
- **設定値**: Discord Webhookから取得（形式: `https://discord.com/api/webhooks/{webhook_id}/{token}`）
- **使用箇所**:
  - `.github/workflows/manus-audit-daily.yml`
  - `.github/workflows/manus-audit-weekly.yml`
  - `.github/workflows/manus-audit-monthly.yml`
  - `.github/workflows/replenish-cards.yml`
  - その他多数のワークフロー

#### `DISCORD_SYSTEM_WEBHOOK` (オプション)
- **用途**: システム点検スクリプト（`scripts/daily-check.sh`）での通知
- **設定値**: `DISCORD_ADMIN_WEBHOOK_URL`と同じ値を推奨
- **使用箇所**:
  - `scripts/daily-check.sh`
  - Supabase Edge Functions（health-check等）

---

### 2. Supabase関連（CI / deploy 用）

#### `SUPABASE_ACCESS_TOKEN`
- **用途**: Supabase CLI操作（デプロイ、ログ確認等）
- **設定値**: `supabase login`で取得したトークン
- **使用箇所**: GitHub Actionsでのデプロイワークフロー

#### `SUPABASE_PROJECT_ID`
- **用途**: GitHub Actions から対象 Supabase project を指定
- **設定値**: `haaxgwyimoqzzxzdaeep`
- **使用箇所**: Edge Functions deploy workflow

---

### 3. n8n関連

#### `N8N_API_KEY`
- **用途**: n8nワークフローの状態確認、実行
- **設定値**: n8n管理画面から生成したAPIキー
- **使用箇所**: Google Sheets同期確認、ワークフロー監視

#### `N8N_INSTANCE_URL`
- **用途**: n8nインスタンスのベースURL
- **設定値**: `https://n8n.srv995974.hstgr.cloud`
- **使用箇所**: n8n API呼び出し

---

### 4. Manus関連

#### `MANUS_AUDIT_API_KEY`
- **用途**: Manus監査Edge Functionの認証
- **設定値**: ランダムに生成された安全なキー
- **使用箇所**:
  - `.github/workflows/manus-audit-*.yml`
  - `supabase/functions/manus-audit-line-daily-brief/`

#### `MANUS_API_KEY`
- **用途**: GitHub Actions から Supabase runtime secret へ同期する入力値
- **設定値**: Manus APIから取得
- **使用箇所**: deploy / bootstrap

---

### 5. Google関連

#### `GOOGLE_SERVICE_ACCOUNT_JSON`
- **用途**: Google Sheets API アクセス
- **設定値**: Google Cloud Consoleから取得したサービスアカウントJSON
- **使用箇所**: Google Sheets同期、データエクスポート

---

### 6. GitHub関連

#### `MANUS_GITHUB_TOKEN`
- **用途**: GitHub API操作（Issue作成、ワークフロートリガー等）
- **設定値**: Personal Access Token（workflow権限付き）
- **使用箇所**: 自動修繕、Issue作成ワークフロー

---

## 📋 Platform Runtime Secrets

以下は GitHub の正本ではなく、runtime 側の secret store に置きます。

### Supabase Edge Function Secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `MANUS_API_KEY`
- `DISCORD_SYSTEM_WEBHOOK`

必要に応じて GitHub Actions から deploy 時に同期してよいですが、実行時の正本は Supabase 側です。

## 🔧 設定方法

### GitHub Secretsへの追加

1. GitHubリポジトリページを開く
2. **Settings** → **Secrets and variables** → **Actions** に移動
3. **New repository secret** をクリック
4. **Name** に上記のSecret名を入力
5. **Value** に対応する値を入力
6. **Add secret** をクリック

### コマンドラインでの設定（GitHub CLI）

```bash
# Discord Webhook
gh secret set DISCORD_ADMIN_WEBHOOK_URL --body "https://discord.com/api/webhooks/..."
gh secret set DISCORD_SYSTEM_WEBHOOK --body "https://discord.com/api/webhooks/..."

# Supabase (CI)
gh secret set SUPABASE_ACCESS_TOKEN --body "your-access-token"
gh secret set SUPABASE_PROJECT_ID --body "haaxgwyimoqzzxzdaeep"

# n8n
gh secret set N8N_API_KEY --body "your-n8n-api-key"
gh secret set N8N_INSTANCE_URL --body "https://n8n.srv995974.hstgr.cloud"

# Manus
gh secret set MANUS_AUDIT_API_KEY --body "your-audit-api-key"
gh secret set MANUS_API_KEY --body "your-manus-api-key"

# Google
gh secret set GOOGLE_SERVICE_ACCOUNT_JSON --body "$(cat service-account.json)"

# GitHub
gh secret set MANUS_GITHUB_TOKEN --body "your-github-token"
```

Supabase runtime へは:

```bash
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=... --project-ref haaxgwyimoqzzxzdaeep
supabase secrets set MANUS_API_KEY=... --project-ref haaxgwyimoqzzxzdaeep
supabase secrets set DISCORD_SYSTEM_WEBHOOK=... --project-ref haaxgwyimoqzzxzdaeep
```

---

## ✅ 設定確認

設定が完了したら、以下のワークフローを手動実行して確認してください:

```bash
# 日次監査ワークフローを手動実行
gh workflow run manus-audit-daily.yml

# 実行結果を確認
gh run list --workflow=manus-audit-daily.yml --limit 1
```

---

## 🔒 セキュリティ注意事項

1. **Secretsは絶対にコミットしない**
   - `.env`ファイルや設定ファイルに直接記載しない
   - `.gitignore`に機密情報ファイルを追加
   - repo 内 `.env` を本番/CI の正本にしない

2. **定期的なローテーション**
   - APIキーやトークンは定期的に再生成
   - 特にWebhook URLは漏洩時に即座に再生成

3. **最小権限の原則**
   - 各Secretには必要最小限の権限のみを付与
   - サービスアカウントは用途別に分離

---

## 📝 トラブルシューティング

### Discord通知が届かない
- `DISCORD_ADMIN_WEBHOOK_URL`が正しく設定されているか確認
- Webhook URLの有効性をテスト:
  ```bash
  curl -X POST "https://discord.com/api/webhooks/..." \
    -H "Content-Type: application/json" \
    -d '{"content":"テスト通知"}'
  ```

### Supabase Edge Functionsが401エラー
- `SUPABASE_SERVICE_ROLE_KEY`が正しく設定されているか確認
- Edge Functionのデプロイ時に`--no-verify-jwt`フラグを使用

### n8n APIが認証エラー
- `N8N_API_KEY`が有効か確認
- n8n管理画面でAPIキーを再生成

---

*このドキュメントは2025-12-27に作成されました*
