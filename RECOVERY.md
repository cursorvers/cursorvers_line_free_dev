# 緊急リカバリー手順

## 概要
このドキュメントは、cursorvers_line_stripe_discord リポジトリで問題が発生した場合の復旧手順を記載しています。

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

### 方法A: 新しいブランチで確認

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

リカバリー後、Edge Functions を再デプロイします。

```bash
# line-webhook 関数をデプロイ
supabase functions deploy line-webhook --no-verify-jwt --project-ref haaxgwyimoqzzxzdaeep

# stripe-webhook 関数をデプロイ（必要な場合）
supabase functions deploy stripe-webhook --project-ref haaxgwyimoqzzxzdaeep
```

---

## 4. データベースのリカバリー

Supabase ダッシュボードから復元可能です：
1. https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep/backups
2. 「Restore」ボタンで任意の時点に復元

**注意**: データベース復元は不可逆です。必要な場合は事前にスナップショットを取得してください。

---

## 5. 緊急連絡先

問題が解決しない場合は、以下を確認してください：
- [Supabase Status](https://status.supabase.com/)
- [LINE Developers Console](https://developers.line.biz/)
- [Stripe Dashboard](https://dashboard.stripe.com/)

---

## 環境変数の確認

リカバリー後、以下の環境変数が正しく設定されているか確認してください：

```bash
# Supabase Secrets 確認
supabase secrets list --project-ref haaxgwyimoqzzxzdaeep
```

必要な環境変数：
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `OPENAI_API_KEY`
- `STRIPE_WEBHOOK_SECRET`

---

最終更新: 2025-12-03


