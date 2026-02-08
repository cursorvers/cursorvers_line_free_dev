-- ============================================
-- stripe_subscription_status + name カラム追加
--
-- 背景: stripe-webhook/index.ts が stripe_subscription_status を参照するが
--        DB には subscription_status しか存在せずエラー発生
--        "Could not find the 'stripe_subscriptionstatus' column of 'members'"
--
-- name カラムも checkout.session.completed で使用されるが未定義
-- ============================================

BEGIN;

-- 1. stripe_subscription_status カラム追加
ALTER TABLE members ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT;

-- 2. name カラム追加
ALTER TABLE members ADD COLUMN IF NOT EXISTS name TEXT;

-- 3. 既存データ移行: subscription_status → stripe_subscription_status
UPDATE members
SET stripe_subscription_status = subscription_status
WHERE subscription_status IS NOT NULL
  AND stripe_subscription_status IS NULL;

-- 4. コメント追加
COMMENT ON COLUMN members.stripe_subscription_status IS 'Stripe APIから取得したサブスクリプション状態 (active/past_due/canceled/trialing等)';
COMMENT ON COLUMN members.name IS '顧客名 (Stripe Checkout customer_details.name)';

COMMIT;
