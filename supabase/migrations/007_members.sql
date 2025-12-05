-- ============================================
-- Members テーブル追加
--  - メール配信／LINE連携／Stripe購読状態を一元管理
-- ============================================

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  line_user_id TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT NOT NULL DEFAULT 'library', -- 'library' | 'master'
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'inactive' | 'canceled' | 'past_due' | 'trialing'
  subscription_status TEXT,
  period_end TIMESTAMPTZ,
  opt_in_email BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_line_user_id ON members(line_user_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- RLS: サービスロールのみ
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only - members" ON members
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- updated_at トリガー
CREATE OR REPLACE FUNCTION update_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION update_members_updated_at();

COMMENT ON TABLE members IS 'Library/Master 有料会員の連携情報（メール/LINE/Stripe）。無料層は含めない。';
COMMENT ON COLUMN members.opt_in_email IS 'メール配信の任意オプトイン。';

