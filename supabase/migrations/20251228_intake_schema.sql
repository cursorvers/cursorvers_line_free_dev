-- ヒアリングBot用スキーマ
-- PHI非保存設計

-- 案件マスタ
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT UNIQUE NOT NULL,  -- CASE-0001
  status TEXT DEFAULT 'intake',       -- intake, active, completed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ヒアリングセッション
CREATE TABLE IF NOT EXISTS intake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'in_progress',  -- in_progress, completed, expired
  current_step TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- ヒアリング回答データ（構造化）
CREATE TABLE IF NOT EXISTS intake_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES intake_sessions(id) ON DELETE CASCADE,

  -- 基本情報
  org_name TEXT,
  bed_count TEXT,
  departments TEXT[],
  location TEXT,

  -- 担当者
  contact_name TEXT,
  contact_role TEXT,
  contact_email TEXT,

  -- 目標
  goals TEXT[],
  priority TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AIツール棚卸し
CREATE TABLE IF NOT EXISTS intake_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES intake_sessions(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_use TEXT,
  department TEXT,
  phi_input BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 監査ログ
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,           -- session_start, step_complete, session_complete
  resource_type TEXT,             -- session, response, tool
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_case_id ON intake_sessions(case_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_status ON intake_sessions(status);
CREATE INDEX IF NOT EXISTS idx_intake_responses_session_id ON intake_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_intake_tools_session_id ON intake_tools(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- RLS有効化
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ポリシー（匿名アクセス許可 - ヒアリングは認証不要）
CREATE POLICY "intake_sessions_anon_insert" ON intake_sessions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "intake_sessions_anon_select" ON intake_sessions
  FOR SELECT TO anon USING (true);

CREATE POLICY "intake_sessions_anon_update" ON intake_sessions
  FOR UPDATE TO anon USING (true);

CREATE POLICY "intake_responses_anon_insert" ON intake_responses
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "intake_responses_anon_update" ON intake_responses
  FOR UPDATE TO anon USING (true);

CREATE POLICY "intake_tools_anon_insert" ON intake_tools
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "audit_log_anon_insert" ON audit_log
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "cases_anon_select" ON cases
  FOR SELECT TO anon USING (true);

-- 更新日時自動更新
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER intake_sessions_updated_at
  BEFORE UPDATE ON intake_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER intake_responses_updated_at
  BEFORE UPDATE ON intake_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
