# 緊急リカバリー手順

## 概要
このドキュメントは、cursorvers_line_stripe_discord リポジトリで問題が発生した場合の復旧手順を記載しています。

## 運用ポリシー / チャネル設計（メール・LINE・Discord・Stripe）

- メール配信対象: **Library / Master 決済者のみ**（Stripe 決済 + 任意チェック ON）。無料層はメール配信しない。  
  - 無料接点: LINE / Discord。メールは「有料層の設計図/アップデート」のチャネルとして扱う。
- 申込フォーム/決済: メール必須 + 任意チェック（デフォルト OFF）「ガバナンス・資産防御レター配信希望」を追加し、利用目的を明記（決済連絡とオプトイン配信を分離）。
- 配信セグメント: `tier ∈ {Library, Master}` かつ `status=active` かつ `opt_in_email=true` のみをメール対象とする。
- Supabase スキーマ方針（例: `members`）: `user_id`, `email`, `line_user_id`, `tier`, `status`, `period_end`, `opt_in_email`, `updated_at`。Stripe Webhook で `tier/status/period_end/opt_in_email` を更新し、LINE 連携で `line_user_id` を紐付け。
- フロー:  
  - Stripe 決済 → `stripe-webhook` で署名検証 → `members` 更新。  
  - LINE Bot → `line-bot` で署名検証 → `members` 照合し無料/有料で応答分岐（無料は診断・配布、有料はレター/アップデート案内）。  
  - メール配信は上記セグメント条件を満たすレコードのみ。
- セキュリティ/運用: 署名検証（Stripe/LINE 必須）、環境変数は `Deno.env.get`。RLS は `members` などに有効化しロール別ポリシーを設定。Webhook 成否をログ/テーブルに残し監視する。

## バックアップ体制
- **頻度**: 毎日 JST 03:00 に自動バックアップ
- **形式**: Git タグ（`backup/YYYY-MM-DD-HHMMSS`）
- **トリガー**: main ブランチへの push 時にも自動実行

---

## 1. 直近のバックアップを確認

```bash
# リモートのタグ一覧を取得
git fetch --tags

# backup タグを日付順で表示
git tag -l "backup/*" | sort -r | head -10
```

---

## 2. 特定のバックアップに戻す

### 方法A: 新しいブランチで確認（推奨）

```bash
# 特定のタグからブランチを作成
git checkout -b recovery-test backup/2025-01-01-030000

# 動作確認後、main にマージ
git checkout main
git merge recovery-test
git push origin main
```

### 方法B: main を直接リセット（注意）

```bash
# main を特定のタグに強制リセット
git checkout main
git reset --hard backup/2025-01-01-030000
git push origin main --force
```

---

## 3. Supabase Edge Functions の再デプロイ

リカバリー後、全ての Edge Functions を再デプロイします。

```bash
cd cursorvers_line_stripe_discord

# LINE関連
supabase functions deploy line-webhook --no-verify-jwt --project-ref haaxgwyimoqzzxzdaeep

# Stripe関連
supabase functions deploy stripe-webhook --project-ref haaxgwyimoqzzxzdaeep

# Discord関連
supabase functions deploy discord-bot --no-verify-jwt --project-ref haaxgwyimoqzzxzdaeep

# Health-ISAC SecBrief関連
supabase functions deploy ingest-hij --no-verify-jwt --project-ref haaxgwyimoqzzxzdaeep
supabase functions deploy generate-sec-brief --no-verify-jwt --project-ref haaxgwyimoqzzxzdaeep

# ヘルスチェック
supabase functions deploy health-check --project-ref haaxgwyimoqzzxzdaeep
```

### 一括デプロイスクリプト

```bash
#!/bin/bash
PROJECT_REF="haaxgwyimoqzzxzdaeep"
FUNCTIONS=("line-webhook" "stripe-webhook" "discord-bot" "ingest-hij" "generate-sec-brief" "health-check")

for func in "${FUNCTIONS[@]}"; do
  echo "Deploying $func..."
  supabase functions deploy "$func" --no-verify-jwt --project-ref "$PROJECT_REF"
done
echo "All functions deployed."
```

---

## 4. データベースのリカバリー

### Supabaseダッシュボードから復元

1. https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep/backups
2. 「Restore」ボタンで任意の時点に復元

**注意**: データベース復元は不可逆です。必要な場合は事前にスナップショットを取得してください。

### テーブル一覧

| テーブル | 用途 |
|---------|------|
| `users` | LINEユーザー情報 |
| `interaction_logs` | 操作ログ |
| `library_members` | 有料会員情報 |
| `hij_raw` | Health-ISAC生データ |
| `sec_brief` | セキュリティブリーフ |

---

## 5. 環境変数の確認と再設定

### 確認

```bash
supabase secrets list --project-ref haaxgwyimoqzzxzdaeep
```

### 必要な環境変数

| 変数名 | 用途 |
|--------|------|
| **LINE関連** | |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API |
| `LINE_CHANNEL_SECRET` | LINE署名検証 |
| **OpenAI** | |
| `OPENAI_API_KEY` | LLM API |
| **Stripe** | |
| `STRIPE_API_KEY` | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Webhook署名検証 |
| **Discord** | |
| `DISCORD_PUBLIC_KEY` | Discord署名検証 |
| `DISCORD_BOT_TOKEN` | Discord Bot API |
| `DISCORD_ROLE_ID` | Library Memberロール |
| `SEC_BRIEF_CHANNEL_ID` | #sec-briefチャンネル |
| **Health-ISAC** | |
| `INGEST_HIJ_API_KEY` | メール取り込みAPI認証 |
| `GENERATE_SEC_BRIEF_API_KEY` | ブリーフ生成API認証 |

### 環境変数の再設定（必要な場合）

```bash
# 例: APIキーの再設定
supabase secrets set INGEST_HIJ_API_KEY=<新しいキー> --project-ref haaxgwyimoqzzxzdaeep
```

---

## 6. GitHub Actions の確認

### ワークフロー一覧

| ファイル | 用途 | スケジュール |
|---------|------|-------------|
| `backup.yml` | 日次バックアップ | 毎日 JST 03:00 |
| `deploy-supabase.yml` | Edge Functions自動デプロイ | push時 |
| `sec-brief-cron.yml` | 週次ブリーフ生成 | 毎週日曜 JST 03:00 |

### GitHub Secrets の確認

リポジトリ Settings → Secrets and variables → Actions で以下を確認：

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `GENERATE_SEC_BRIEF_API_KEY`
- `DISCORD_SYSTEM_WEBHOOK`（任意）

---

## 7. 外部サービスの確認

問題が解決しない場合は、以下を確認してください：

- [Supabase Status](https://status.supabase.com/)
- [LINE Developers Console](https://developers.line.biz/)
- [Stripe Dashboard](https://dashboard.stripe.com/)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [GitHub Actions Status](https://www.githubstatus.com/)

---

## 8. 障害時のチェックリスト

### Edge Function が動作しない

1. [ ] Supabase ダッシュボードでログを確認
2. [ ] 環境変数が正しく設定されているか確認
3. [ ] 関数を再デプロイ
4. [ ] Supabase のステータスを確認

### Discord Bot が応答しない

1. [ ] Discord Developer Portal でBot がオンラインか確認
2. [ ] Interactions Endpoint URL が正しいか確認
3. [ ] `DISCORD_PUBLIC_KEY` が正しいか確認
4. [ ] `discord-bot` 関数を再デプロイ

### Health-ISAC ブリーフが生成されない

1. [ ] `hij_raw` テーブルにデータがあるか確認
2. [ ] GitHub Actions の `sec-brief-cron` ログを確認
3. [ ] `OPENAI_API_KEY` が有効か確認
4. [ ] `generate-sec-brief` 関数を手動実行してテスト

### Gmail → Supabase 連携（GAS）が動作しない

1. [ ] Google Apps Script のダッシュボードでエラーログを確認
2. [ ] GASのトリガーが有効か確認（1時間おきまたは6時間おき）
3. [ ] `INGEST_HIJ_API_KEY` が GAS の `CONFIG.API_KEY` と一致しているか確認
4. [ ] Supabase ダッシュボードで `ingest-hij` のログを確認
5. [ ] 手動で `ingest-hij` を curl でテスト

```bash
curl -X POST https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/ingest-hij \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <INGEST_HIJ_API_KEY>" \
  -d '{
    "message_id": "test-123",
    "sent_at": "2025-12-03T12:00:00+09:00",
    "subject": "Test Subject",
    "body": "Test body content"
  }'
```

### GAS 再セットアップ手順

1. `docs/GAS_SETUP.md` を参照してスクリプトを再作成
2. Gmail で `label:health-isac-japan` が正しく適用されているか確認
3. トリガーを再設定（1時間おきまたは6時間おき）
4. エラー通知を有効化（毎日通知）

---

## 9. 環境変数のバックアップ

**重要**: 環境変数は自動バックアップされません。手動で安全な場所に保管してください。

```bash
# 現在の環境変数を取得（値は伏せて表示）
supabase secrets list --project-ref haaxgwyimoqzzxzdaeep

# 1Passwordや安全なドキュメントに以下を保存:
# - LINE_CHANNEL_ACCESS_TOKEN
# - LINE_CHANNEL_SECRET
# - OPENAI_API_KEY
# - STRIPE_API_KEY
# - STRIPE_WEBHOOK_SECRET
# - DISCORD_PUBLIC_KEY
# - DISCORD_BOT_TOKEN
# - DISCORD_ROLE_ID
# - SEC_BRIEF_CHANNEL_ID
# - INGEST_HIJ_API_KEY
# - GENERATE_SEC_BRIEF_API_KEY
```

---

最終更新: 2025-12-03
