-- ============================================
-- Stripe Analytics: 収益分析ビュー + 支払い履歴テーブル
-- ============================================

-- ============================================
-- 1. 支払い履歴テーブル
-- ============================================
CREATE TABLE IF NOT EXISTS payment_history (
  id TEXT PRIMARY KEY,                          -- Stripe charge/payment_intent ID
  customer_id TEXT,                             -- Stripe customer ID
  email TEXT,                                   -- 顧客メール
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,                      -- 金額（円）
  currency TEXT DEFAULT 'jpy',
  status TEXT NOT NULL,                         -- succeeded, failed, refunded, pending
  description TEXT,                             -- 商品説明
  tier TEXT,                                    -- library, master
  payment_method_type TEXT,                     -- card, konbini, etc.
  failure_code TEXT,                            -- 失敗時のコード
  failure_message TEXT,                         -- 失敗時のメッセージ
  refunded_amount INTEGER DEFAULT 0,            -- 返金額
  receipt_url TEXT,                             -- レシートURL
  stripe_created BIGINT,                        -- Stripe側の作成日時（Unix timestamp）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_history_email ON payment_history(email);
CREATE INDEX IF NOT EXISTS idx_payment_history_member_id ON payment_history(member_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_status ON payment_history(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_created_at ON payment_history(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_history_stripe_created ON payment_history(stripe_created);

-- RLS: サービスロールのみ
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only - payment_history" ON payment_history
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- updated_at トリガー
CREATE OR REPLACE FUNCTION update_payment_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_payment_history_updated_at
  BEFORE UPDATE ON payment_history
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_history_updated_at();

COMMENT ON TABLE payment_history IS 'Stripe支払い履歴（顧客対応・分析用）';

-- ============================================
-- 2. 収益分析ビュー: MRR/会員統計
-- ============================================
CREATE OR REPLACE VIEW member_revenue_stats AS
SELECT
  tier,
  COUNT(*) as total_members,
  COUNT(*) FILTER (WHERE status = 'active') as active_members,
  COUNT(*) FILTER (WHERE status = 'inactive') as inactive_members,
  COUNT(*) FILTER (WHERE status = 'canceled') as canceled_members,
  -- MRR計算（tier別単価）
  CASE tier
    WHEN 'master' THEN COUNT(*) FILTER (WHERE status = 'active') * 9800
    WHEN 'library' THEN COUNT(*) FILTER (WHERE status = 'active') * 2980
    ELSE 0
  END as mrr_jpy,
  -- 解約率（過去30日）
  ROUND(
    COUNT(*) FILTER (WHERE status = 'canceled' AND updated_at > now() - INTERVAL '30 days')::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 2
  ) as churn_rate_30d
FROM members
GROUP BY tier;

COMMENT ON VIEW member_revenue_stats IS 'tier別のMRR・会員数・解約率';

-- ============================================
-- 3. 収益分析ビュー: 月次サマリー
-- ============================================
CREATE OR REPLACE VIEW monthly_revenue_summary AS
SELECT
  date_trunc('month', created_at) as month,
  COUNT(*) FILTER (WHERE status = 'succeeded') as successful_payments,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_payments,
  SUM(amount) FILTER (WHERE status = 'succeeded') as total_revenue_jpy,
  SUM(refunded_amount) as total_refunds_jpy,
  SUM(amount) FILTER (WHERE status = 'succeeded') - COALESCE(SUM(refunded_amount), 0) as net_revenue_jpy,
  COUNT(DISTINCT email) as unique_customers
FROM payment_history
GROUP BY date_trunc('month', created_at)
ORDER BY month DESC;

COMMENT ON VIEW monthly_revenue_summary IS '月次の売上・返金・顧客数サマリー';

-- ============================================
-- 4. イベントサマリービュー（既存テーブル活用）
-- ============================================
CREATE OR REPLACE VIEW stripe_event_summary AS
SELECT
  date_trunc('day', processed_at) as date,
  event_type,
  COUNT(*) as event_count
FROM stripe_events_processed
WHERE processed_at > now() - INTERVAL '30 days'
GROUP BY date_trunc('day', processed_at), event_type
ORDER BY date DESC, event_count DESC;

COMMENT ON VIEW stripe_event_summary IS '過去30日のStripeイベント集計';

-- ============================================
-- 5. 顧客別支払い履歴ビュー（LINE Bot用）
-- ============================================
CREATE OR REPLACE VIEW customer_payment_summary AS
SELECT
  m.id as member_id,
  m.email,
  m.line_user_id,
  m.tier,
  m.status as member_status,
  COUNT(ph.id) as total_payments,
  SUM(ph.amount) FILTER (WHERE ph.status = 'succeeded') as total_paid_jpy,
  MAX(ph.created_at) FILTER (WHERE ph.status = 'succeeded') as last_payment_at,
  json_agg(
    json_build_object(
      'id', ph.id,
      'amount', ph.amount,
      'status', ph.status,
      'description', ph.description,
      'created_at', ph.created_at
    ) ORDER BY ph.created_at DESC
  ) FILTER (WHERE ph.id IS NOT NULL) as payment_history
FROM members m
LEFT JOIN payment_history ph ON m.id = ph.member_id
GROUP BY m.id, m.email, m.line_user_id, m.tier, m.status;

COMMENT ON VIEW customer_payment_summary IS '顧客別の支払いサマリー（LINE Bot対応用）';
