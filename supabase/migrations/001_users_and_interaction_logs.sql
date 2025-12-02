-- ============================================
-- Pocket Defense Tool: Phase 0 マイグレーション
-- users テーブル + interaction_logs テーブル
-- ============================================

-- 1. users テーブル
-- LINE ユーザーを起点に、将来の Stripe / Discord 連携も視野に入れた設計
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT UNIQUE,                    -- LINE userId（将来 Discord 等も追加するので nullable）
  email TEXT,                                   -- 任意（LINE 経由では取得できない）
  stripe_customer_id TEXT,                      -- 将来の Stripe 連携用フック
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- インデックス: line_user_id での検索を高速化
CREATE INDEX IF NOT EXISTS idx_users_line_user_id ON users(line_user_id);

-- 2. interaction_logs テーブル
-- PHI（患者情報）は保存しない。生テキストも保存しない。
CREATE TABLE IF NOT EXISTS interaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL,              -- 'prompt_polisher' | 'risk_checker' | 'course_entry'
  course_keyword TEXT,                          -- '病院AIリスク診断' など（course_entry 時のみ）
  risk_flags TEXT[] DEFAULT '{}',               -- Risk Checker で検出されたフラグ配列
  length_bucket TEXT,                           -- '0-100' | '100-300' | '300-1000' | '1000+'
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- インデックス: user_id + created_at での集計を高速化
CREATE INDEX IF NOT EXISTS idx_interaction_logs_user_id ON interaction_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_created_at ON interaction_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_type ON interaction_logs(interaction_type);

-- 3. RLS（Row Level Security）設定
-- これらのテーブルはサーバーサイド専用。クライアント直叩きは禁止。
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_logs ENABLE ROW LEVEL SECURITY;

-- サービスロールのみアクセス可能（Edge Functions から service_role key で操作）
-- anon / authenticated ユーザーからは一切アクセス不可
CREATE POLICY "Service role only - users" ON users
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only - interaction_logs" ON interaction_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. updated_at 自動更新トリガー（users テーブル用）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- コメント
-- ============================================
COMMENT ON TABLE users IS 'LINE ユーザーを起点としたユーザー管理テーブル。PHI は保存しない。';
COMMENT ON TABLE interaction_logs IS 'Prompt Polisher / Risk Checker / 診断キーワードの利用ログ。生テキストは保存しない。';
COMMENT ON COLUMN interaction_logs.length_bucket IS '入力文字数のバケット。プライバシー保護のため実際の文字数は保存しない。';

