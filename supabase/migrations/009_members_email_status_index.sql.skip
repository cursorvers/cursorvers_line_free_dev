-- 複合インデックスで email + stripe_subscription_status を高速化
CREATE INDEX IF NOT EXISTS idx_members_email_stripe_subscription_status
  ON members(email, stripe_subscription_status);
