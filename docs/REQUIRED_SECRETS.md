# 必須GitHub Secrets設定ガイド

このドキュメントでは、Cursorversシステムの自動点検・監視機能に必要なGitHub Secretsの設定方法を説明します。

---

## 📋 必須Secrets一覧

### 1. Discord Webhook関連

#### `DISCORD_ADMIN_WEBHOOK_URL`
- **用途**: システム監査、エラー通知、日次レポート送信
- **設定値**: `https://discord.com/api/webhooks/1448220557211336776/fakXFuRH2nG-c-gF6kUAnekjaim3mgJ9zeFg6ft7NILcL1_9iA8gChqiPray-aIbK5LB`
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

### 2. Supabase関連

#### `SUPABASE_URL`
- **用途**: Supabase APIエンドポイント
- **設定値**: `https://haaxgwyimoqzzxzdaeep.supabase.co`
- **使用箇所**: 全てのSupabase Edge Functions呼び出し

#### `SUPABASE_SERVICE_ROLE_KEY`
- **用途**: Supabase管理者権限での操作
- **設定値**: Supabaseプロジェクト設定から取得
- **使用箇所**: データベース操作、Edge Functions認証

#### `SUPABASE_ACCESS_TOKEN`
- **用途**: Supabase CLI操作（デプロイ、ログ確認等）
- **設定値**: `supabase login`で取得したトークン
- **使用箇所**: GitHub Actionsでのデプロイワークフロー

#### `SUPABASE_ANON_KEY`
- **用途**: 公開APIアクセス
- **設定値**: Supabaseプロジェクト設定から取得
- **使用箇所**: フロントエンドからのAPI呼び出し

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
- **用途**: Manus API呼び出し（カード生成等）
- **設定値**: Manus APIから取得
- **使用箇所**: カード自動生成ワークフロー

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

# Supabase
gh secret set SUPABASE_URL --body "https://haaxgwyimoqzzxzdaeep.supabase.co"
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "your-service-role-key"
gh secret set SUPABASE_ACCESS_TOKEN --body "your-access-token"
gh secret set SUPABASE_ANON_KEY --body "your-anon-key"

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
