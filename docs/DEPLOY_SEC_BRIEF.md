# Health-ISAC SecBrief デプロイ手順書

## 前提条件

- Supabase CLI がインストール済み
- Supabase プロジェクトID: `haaxgwyimoqzzxzdaeep`
- GitHub リポジトリへのアクセス権限

---

## Step 1: Supabase CLI の確認

```bash
# Supabase CLI のバージョン確認
supabase --version

# ログイン確認
supabase projects list
```

未インストールの場合:

```bash
# macOS
brew install supabase/tap/supabase

# または npm
npm install -g supabase
```

---

## Step 2: データベースマイグレーション実行

```bash
cd cursorvers_line_stripe_discord

# マイグレーションファイルをSupabaseに適用
supabase db push --project-ref haaxgwyimoqzzxzdaeep
```

**確認方法:**

Supabase Dashboard → SQL Editor で以下を実行:

```sql
-- テーブルが作成されているか確認
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('hij_raw', 'sec_brief');

-- enum が作成されているか確認
SELECT typname FROM pg_type WHERE typname = 'sec_brief_status';
```

---

## Step 3: 環境変数（Secrets）の設定

### 3-1. APIキーの生成

```bash
# ランダムなAPIキーを生成（2つ）
openssl rand -hex 32
# → 例: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2

# もう1つ生成
openssl rand -hex 32
# → 例: f2e1d0c9b8a7z6y5x4w3v2u1t0s9r8q7p6o5n4m3l2k1j0i9h8g7f6e5d4c3b2a1
```

### 3-2. Supabase Secrets に設定

```bash
# ingest-hij 用のAPIキー
supabase secrets set INGEST_HIJ_API_KEY=<最初に生成したキー> --project-ref haaxgwyimoqzzxzdaeep

# generate-sec-brief 用のAPIキー
supabase secrets set GENERATE_SEC_BRIEF_API_KEY=<2番目に生成したキー> --project-ref haaxgwyimoqzzxzdaeep

# Discord #sec-brief チャンネルID（後述のStep 6で取得）
supabase secrets set SEC_BRIEF_CHANNEL_ID=<チャンネルID> --project-ref haaxgwyimoqzzxzdaeep
```

**確認:**

```bash
supabase secrets list --project-ref haaxgwyimoqzzxzdaeep
```

既存の環境変数も確認:
- `OPENAI_API_KEY` （既に設定済みのはず）
- `SUPABASE_URL` （自動設定）
- `SUPABASE_SERVICE_ROLE_KEY` （自動設定）

---

## Step 4: Edge Functions のデプロイ

```bash
cd cursorvers_line_stripe_discord

# 1. ingest-hij をデプロイ
supabase functions deploy ingest-hij --no-verify-jwt --project-ref haaxgwyimoqzzxzdaeep

# 2. generate-sec-brief をデプロイ
supabase functions deploy generate-sec-brief --no-verify-jwt --project-ref haaxgwyimoqzzxzdaeep

# 3. discord-bot をデプロイ（既存の拡張版）
supabase functions deploy discord-bot --no-verify-jwt --project-ref haaxgwyimoqzzxzdaeep
```

**デプロイ確認:**

各関数のURLをメモ:
- `ingest-hij`: `https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/ingest-hij`
- `generate-sec-brief`: `https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/generate-sec-brief`

---

## Step 5: Discord スラッシュコマンドの登録

### 5-1. Discord Developer Portal にアクセス

1. https://discord.com/developers/applications にアクセス
2. 該当のBotアプリケーションを選択
3. 左メニュー「Commands」をクリック

### 5-2. 新規コマンドを追加

#### `/sec-brief-latest`

- **Name**: `sec-brief-latest`
- **Description**: `最新のセキュリティ・ブリーフの下書きを表示`
- **Options**: なし

#### `/sec-brief-publish`

- **Name**: `sec-brief-publish`
- **Description**: `最新のセキュリティ・ブリーフを #sec-brief に公開`
- **Options**: なし

### 5-3. コマンドをサーバーに同期

```bash
# Discord Bot の Application ID と Guild ID が必要
# 通常は Discord Developer Portal で確認可能

# または、Discord 内で以下のコマンドを実行（Botがオンラインの場合）
# /sync-commands
```

**注意:** コマンドの反映には数分かかる場合があります。

---

## Step 6: Discord #sec-brief チャンネルの設定

### 6-1. チャンネルIDの取得

1. Discord で `#sec-brief` チャンネルを作成（または既存チャンネルを使用）
2. チャンネルを右クリック → 「IDをコピー」
3. 開発者モードが有効でない場合: 設定 → 詳細設定 → 開発者モードをON

### 6-2. チャンネルIDをSupabase Secretsに設定

```bash
supabase secrets set SEC_BRIEF_CHANNEL_ID=<コピーしたチャンネルID> --project-ref haaxgwyimoqzzxzdaeep
```

---

## Step 7: GitHub Actions Secrets の設定

### 7-1. GitHub リポジトリの設定

1. GitHub リポジトリ → Settings → Secrets and variables → Actions
2. 「New repository secret」をクリック

### 7-2. 必要なSecretsを追加

| Secret名 | 値 | 説明 |
|---------|---|------|
| `SUPABASE_URL` | `https://haaxgwyimoqzzxzdaeep.supabase.co` | SupabaseプロジェクトURL |
| `GENERATE_SEC_BRIEF_API_KEY` | Step 3で生成した2番目のキー | cron実行時の認証用 |

**既存のSecrets確認:**

以下も設定されているか確認:
- `SUPABASE_ACCESS_TOKEN` （Supabase CLI用）
- `SUPABASE_PROJECT_ID` （`haaxgwyimoqzzxzdaeep`）
- `DISCORD_ADMIN_WEBHOOK_URL` （任意・失敗通知用）

---

## Step 8: 動作確認

### 8-1. ingest-hij のテスト

```bash
# テスト用のJSONペイロード
curl -X POST https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/ingest-hij \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <INGEST_HIJ_API_KEY>" \
  -d '{
    "message_id": "test-001",
    "sent_at": "2025-12-03T10:00:00+09:00",
    "subject": "【テスト】Health-ISAC Japan Daily Cyber Headlines",
    "body": "これはテストメールです。TLP:GREEN"
  }'
```

**期待されるレスポンス:**

```json
{
  "status": "success",
  "id": "uuid...",
  "message_id": "test-001",
  "tlp": "GREEN"
}
```

### 8-2. generate-sec-brief のテスト

```bash
# 手動実行（GitHub Actions経由でも可）
curl -X POST https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/generate-sec-brief \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <GENERATE_SEC_BRIEF_API_KEY>"
```

**確認:**

```sql
-- 生成されたドラフトを確認
SELECT id, title, week_start, status, created_at 
FROM sec_brief 
ORDER BY created_at DESC 
LIMIT 1;
```

### 8-3. Discord コマンドのテスト

1. Discord で `/sec-brief-latest` を実行
2. プレビューが表示されることを確認
3. `/sec-brief-publish` を実行
4. `#sec-brief` チャンネルに投稿されることを確認

---

## Step 9: GitHub Actions cron の確認

### 9-1. ワークフローの確認

`.github/workflows/sec-brief-cron.yml` が正しく配置されているか確認:

```bash
cat .github/workflows/sec-brief-cron.yml
```

### 9-2. 手動実行テスト

GitHub リポジトリ → Actions → 「Generate Security Brief」→ 「Run workflow」で手動実行可能。

---

## トラブルシューティング

### エラー: "Invalid signature" (Discord Bot)

- `DISCORD_PUBLIC_KEY` が正しく設定されているか確認
- Discord Developer Portal で Bot の Public Key を再確認

### エラー: "Unauthorized" (ingest-hij)

- `INGEST_HIJ_API_KEY` が Supabase Secrets に正しく設定されているか確認
- GAS の `CONFIG.API_KEY` と一致しているか確認

### エラー: "Channel not found" (Discord publish)

- `SEC_BRIEF_CHANNEL_ID` が正しく設定されているか確認
- Bot が `#sec-brief` チャンネルにアクセス権限を持っているか確認

### エラー: "OPENAI_API_KEY not set"

- Supabase Secrets に `OPENAI_API_KEY` が設定されているか確認:
  ```bash
  supabase secrets list --project-ref haaxgwyimoqzzxzdaeep | grep OPENAI
  ```

---

## 次のステップ

1. **Google Apps Script の設定**: `docs/GAS_SETUP.md` を参照
2. **Gmail フィルタの設定**: Health-ISAC Japan からのメールにラベルを付与
3. **定期実行の確認**: 週次で自動生成されることを確認

---

最終更新: 2025-12-03

