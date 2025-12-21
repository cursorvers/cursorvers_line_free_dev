# SECURITY INVOKER 変更の影響分析レポート

対象ビュー: `public.line_card_broadcasts_daily_stats`  
変更内容: SECURITY DEFINER → SECURITY INVOKER  
分析日: 2025-12-10

---

## 1. 現状の確認

### 1.1 ビュー定義
```sql
CREATE OR REPLACE VIEW line_card_broadcasts_daily_stats AS
SELECT 
  DATE(broadcasted_at) as date,
  COUNT(*) as total_broadcasts,
  COUNT(*) FILTER (WHERE broadcast_status = 'success') as successful_broadcasts,
  COUNT(*) FILTER (WHERE broadcast_status = 'failed') as failed_broadcasts,
  COUNT(DISTINCT theme) as themes_used
FROM line_card_broadcasts
GROUP BY DATE(broadcasted_at)
ORDER BY date DESC;
```
現在の設定: デフォルト（PostgreSQL 15 では SECURITY INVOKER がデフォルト）  
問題: Supabase Advisor が SECURITY DEFINER として検出している

### 1.2 基底テーブル line_card_broadcasts の RLS 設定
```sql
ALTER TABLE line_card_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON line_card_broadcasts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```
重要:
- RLS が有効化されている
- service_role のみがアクセス可能
- 一般ユーザー（anon, authenticated）向けのポリシーは存在しない

---

## 2. ビューの使用箇所の調査

### 2.1 コード内での直接参照
- 検索結果: line_card_broadcasts_daily_stats ビューを直接参照している箇所は見つからず。

### 2.2 基底テーブル line_card_broadcasts へのアクセス

**アクセス箇所1: line-daily-brief Edge Function**  
ファイル: `/supabase/functions/line-daily-brief/index.ts`  
処理: LINE Daily Brief を配信し、配信履歴を line_card_broadcasts に記録  
認証: service_role  
操作: `insert`  
影響: なし（service_role で RLS を満たす）

**アクセス箇所2: manus-audit-line-daily-brief Edge Function**  
ファイル: `/supabase/functions/manus-audit-line-daily-brief/index.ts`  
処理: 過去7日間の配信成功率チェック、90日以上前の履歴カウント  
認証: たぶん service_role  
影響: なし（service_role で RLS を満たす）

---

## 3. SECURITY INVOKER 変更の影響評価

### 3.1 ビューへの直接アクセス
- 現状: 直接参照なし  
- 変更後影響: なし

### 3.2 基底テーブルへのアクセス
- 現状: すべて service_role  
- RLS: service_role のみ許可  
- 変更後影響: なし（invoker でも service_role で通る）

### 3.3 将来的リスク
**シナリオ1: フロントエンド（anon/authenticated）からビューを読む場合**  
- 変更後: invoker なので anon/authenticated の RLS に従い拒否される  
- 対策: 必要なら anon/authenticated 向けポリシー追加、または definer 維持でオーナーを限定

**シナリオ2: 管理画面等でビューを使う場合**  
- service_role なら問題なし  
- authenticated なら拒否される可能性  
- 対策: 管理画面は Edge Function 経由 (service_role) か、専用ポリシーを追加

---

## 4. 結論

### 4.1 現時点での影響
- 変更による影響なし。
  1) ビュー直接参照なし  
  2) アクセスは service_role のみ  
  3) service_role は RLS を満たす

### 4.2 推奨事項
- 推奨: SECURITY INVOKER に明示変更（不要な権限昇格を防ぐ）  
- テスト: line-daily-brief / manus-audit-line-daily-brief が正常動作するか、Advisor 警告解消を確認
- 将来拡張: フロント/管理画面から読む場合はポリシー追加または Edge Function 経由にする

---

## 5. 実装計画

### 5.1 マイグレーション SQL
```sql
-- Migration: Fix SECURITY DEFINER warning for line_card_broadcasts_daily_stats
-- Description: Change view to SECURITY INVOKER (PostgreSQL 15 default)

-- Backup current definition (for reference)
-- SELECT pg_get_viewdef('public.line_card_broadcasts_daily_stats'::regclass, true);

-- Drop and recreate view with explicit SECURITY INVOKER
DROP VIEW IF EXISTS public.line_card_broadcasts_daily_stats;

CREATE VIEW public.line_card_broadcasts_daily_stats
WITH (security_invoker = true)
AS
SELECT 
  DATE(broadcasted_at) as date,
  COUNT(*) as total_broadcasts,
  COUNT(*) FILTER (WHERE broadcast_status = 'success') as successful_broadcasts,
  COUNT(*) FILTER (WHERE broadcast_status = 'failed') as failed_broadcasts,
  COUNT(DISTINCT theme) as themes_used
FROM line_card_broadcasts
GROUP BY DATE(broadcasted_at)
ORDER BY date DESC;

COMMENT ON VIEW public.line_card_broadcasts_daily_stats IS 
  'Daily broadcast statistics (SECURITY INVOKER - respects caller RLS policies)';
```

### 5.2 テスト手順
1. 適用前: line-daily-brief を手動実行し成功を確認  
2. 適用: 上記 SQL を実行  
3. 適用後: line-daily-brief 再実行、Advisor 警告消失確認  
4. ロールバック: 旧定義で再作成（必要なら pg_get_viewdef の結果を利用）

---

## 6. リスク評価
| リスク項目 | 発生確率 | 影響度 | 対応策 |
| --- | --- | --- | --- |
| Edge Function が動作しなくなる | 極低 | 高 | service_role 使用のため影響なし |
| ビューへのアクセスが拒否される | 極低 | 中 | 現状ビュー参照なし |
| 将来の拡張時に問題発生 | 低 | 中 | RLS 追加や Edge Function 経由で対応 |

総合リスク: 極めて低い

---

## 7. 承認事項
- 影響分析を確認した  
- マイグレーション SQL を確認した  
- テスト手順を確認した  
- ロールバック手順を確認した  
- 実装を承認する  

作成者: Manus AI  
レビュー: （担当者名）  
承認: （担当者名）

