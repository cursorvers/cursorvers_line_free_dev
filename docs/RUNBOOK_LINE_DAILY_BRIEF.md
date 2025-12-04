# LINE Daily Brief 運用マニュアル（RUNBOOK）

## 概要

LINE Daily Briefは、毎日07:00 JSTに自動配信されるLINEメッセージシステムです。
Obsidian Vaultから抽出したカードを、テーマのバランスを保ちながら配信します。

---

## システム構成

### コンポーネント
- **Edge Function**: `line-daily-brief` (Supabase)
- **ワークフロー**: `.github/workflows/line-daily-brief-cron.yml`
- **データベース**: `line_cards` テーブル
- **認証**: `X-API-Key` ヘッダー（`LINE_DAILY_BRIEF_API_KEY`）

### 配信スケジュール
- **時刻**: 毎日 07:00 JST (22:00 UTC)
- **トリガー**: GitHub Actions cron

---

## 日常運用

### 配信状況の確認

#### 1. GitHub Actionsで確認
```bash
# 最新の実行結果を確認
gh run list --workflow="line-daily-brief-cron.yml" --limit 5

# 詳細ログを確認
gh run view <RUN_ID> --log
```

#### 2. Supabaseダッシュボードで確認
- **Functions → line-daily-brief → Logs**
  - 配信成功/失敗のログを確認
  - エラーメッセージを確認

#### 3. データベースで確認
```sql
-- 最新の配信カードを確認
SELECT id, theme, times_used, last_used_at, status
FROM line_cards
WHERE last_used_at IS NOT NULL
ORDER BY last_used_at DESC
LIMIT 10;

-- テーマ別の配信状況
SELECT theme, COUNT(*) as total, SUM(times_used) as total_used
FROM line_cards
GROUP BY theme;
```

---

## 緊急対応

### 配信を停止する

#### 方法1: GitHub Actionsワークフローを無効化
1. GitHubリポジトリ → Settings → Actions → General
2. 「Disable Actions」を選択（一時的）
3. または、ワークフローファイルを編集してcronをコメントアウト

#### 方法2: Edge Functionを無効化
```bash
# Edge Functionを削除（一時的）
supabase functions delete line-daily-brief --project-ref haaxgwyimoqzzxzdaeep
```

#### 方法3: カードを全てアーカイブ
```sql
-- 全てのカードをアーカイブ（配信対象外にする）
UPDATE line_cards SET status = 'archived';
```

### 配信を再開する

1. 停止方法を元に戻す
2. カードのステータスを復元（必要に応じて）
```sql
-- アーカイブしたカードを復元
UPDATE line_cards SET status = 'ready' WHERE status = 'archived';
```

### 手動で配信する

#### GitHub Actionsから手動実行
1. GitHubリポジトリ → Actions → LINE Daily Brief
2. 「Run workflow」をクリック
3. ブランチを選択して実行

#### curlで直接実行
```bash
curl -X POST \
  -H "X-API-Key: <LINE_DAILY_BRIEF_API_KEY>" \
  -H "Content-Type: application/json" \
  "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-daily-brief"
```

---

## トラブルシューティング

### 問題: 配信が失敗している（401エラー）

**原因**: 認証エラー
**確認方法**:
1. GitHub Secretsに`LINE_DAILY_BRIEF_API_KEY`が設定されているか確認
2. Supabaseシークレットに`LINE_DAILY_BRIEF_API_KEY`が設定されているか確認
3. 値が一致しているか確認

**解決方法**:
```bash
# 新しいAPIキーを生成
openssl rand -hex 32

# GitHub Secretsに設定
gh secret set LINE_DAILY_BRIEF_API_KEY --body "<新しいキー>"

# Supabaseシークレットに設定
supabase secrets set LINE_DAILY_BRIEF_API_KEY=<新しいキー> --project-ref haaxgwyimoqzzxzdaeep
```

### 問題: 配信が失敗している（500エラー）

**原因**: Edge Function内のエラー
**確認方法**:
1. Supabaseダッシュボード → Functions → line-daily-brief → Logs
2. エラーログを確認

**よくある原因**:
- LINE APIのレート制限
- データベース接続エラー
- カード選択ロジックのエラー

**解決方法**:
- エラーログの内容に応じて対応
- LINE APIのレート制限の場合は、自動リトライが機能するはず

### 問題: カードが配信されない

**原因**: 配信可能なカードがない
**確認方法**:
```sql
-- 配信可能なカード数を確認
SELECT theme, COUNT(*) as count
FROM line_cards
WHERE status = 'ready'
GROUP BY theme;
```

**解決方法**:
1. Obsidian Vaultからカードを同期
```bash
cd scripts/export-line-cards
deno task export
```

2. 既に配信済みのカードを再利用可能にする
```sql
-- 配信済みカードを再利用可能にする
UPDATE line_cards SET status = 'ready' WHERE status = 'used';
```

### 問題: 同じテーマが連続で配信される

**原因**: テーマ除外ロジックが機能していない可能性
**確認方法**:
```sql
-- 直近の配信テーマを確認
SELECT theme, last_used_at
FROM line_cards
WHERE last_used_at IS NOT NULL
ORDER BY last_used_at DESC
LIMIT 5;
```

**解決方法**:
- Edge Functionのログで`lastTheme`を確認
- テーマ統計を確認
```sql
SELECT * FROM get_theme_stats();
```

---

## 監視・アラート

### 現在の監視方法

1. **GitHub Actions**: 失敗時にDiscord Webhookで通知
2. **Supabase Logs**: 手動で確認

### 推奨される監視

1. **日次配信成功/失敗の確認**
   - 毎朝、前日の配信結果を確認
   - GitHub Actionsの実行結果を確認

2. **カード在庫の監視**
   - 週1回、各テーマのカード数を確認
   - 50枚以下になったら警告

3. **エラーログの監視**
   - 週1回、Supabase Logsでエラーを確認

---

## メンテナンス

### カードの追加

1. Obsidian Vaultに`#cv_line`タグを追加
2. 同期スクリプトを実行
```bash
cd scripts/export-line-cards
deno task export
```

### カードの削除

```sql
-- 特定のカードをアーカイブ
UPDATE line_cards SET status = 'archived' WHERE id = '<card_id>';

-- 特定のテーマのカードを全てアーカイブ
UPDATE line_cards SET status = 'archived' WHERE theme = 'general';
```

### カードの編集

```sql
-- カードの本文を更新
UPDATE line_cards SET body = '新しい本文' WHERE id = '<card_id>';
```

### 配信回数のリセット

```sql
-- 全てのカードの配信回数をリセット
UPDATE line_cards SET times_used = 0, status = 'ready';
```

---

## 緊急連絡先

- **GitHubリポジトリ**: https://github.com/mo666-med/cursorvers_line_free_dev
- **Supabaseダッシュボード**: https://supabase.com/dashboard/project/haaxgwyimoqzzxzdaeep
- **Discord通知**: 失敗時に自動通知

---

## 更新履歴

- 2025-12-04: 初版作成

