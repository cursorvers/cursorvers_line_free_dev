# 顧客データ保存先調査

## 調査目的
register.html から送信されたメールアドレス・LINE情報がどこに保存されているかを特定する。

## 調査対象

### 1. Supabase Edge Function: `line-register`
**場所:** `supabase/functions/line-register/index.ts`

**確認ポイント:**
- 受信データ: `{ email, opt_in_email, line_user_id, id_token }`
- データの保存先（Supabaseテーブル名）
- Google Sheets連携の有無

### 2. Supabaseデータベース
**確認するテーブル:**
- `users` または `line_users`
- `registrations`
- `subscribers`

### 3. n8nワークフロー
**確認ポイント:**
- LINE follow イベントでユーザーデータをGoogle Sheetsに同期しているか
- `line-register` からのWebhook連携があるか

## 調査手順

```bash
# 1. line-register Edge Functionを確認
cat supabase/functions/line-register/index.ts

# 2. Supabaseテーブル一覧を確認（Supabase Dashboard）
# Project: haaxgwyimoqzzxzdaeep
# URL: https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep/editor

# 3. n8nワークフローを確認
# n8n Dashboard でLINE関連のワークフローを確認
```

## 期待される結果
1. メールアドレスの保存先（Supabase or Google Sheets）
2. LINE User IDの保存先
3. データ同期の仕組み（リアルタイム or バッチ）

## 報告フォーマット
```
【保存先】
- メールアドレス: [テーブル名/シート名]
- LINE User ID: [テーブル名/シート名]
- opt_in_email: [テーブル名/シート名]

【同期方法】
- [リアルタイム/バッチ/なし]
- [n8n/直接保存/Webhook]
```
