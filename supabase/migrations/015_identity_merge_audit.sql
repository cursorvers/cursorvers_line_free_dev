-- Phase 5-2: Identity Merge Audit Log
-- Records all merge decisions for accountability and rollback capability

CREATE TABLE IF NOT EXISTS identity_merge_audit (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL CHECK (action IN ('AUTO_MERGE', 'HOLD_FOR_REVIEW', 'NO_CANDIDATES')),
  evidence TEXT,
  "paidMemberId" TEXT NOT NULL,
  "paidEmail" TEXT NOT NULL,
  "candidateId" TEXT,
  "candidateLineUserId" TEXT
);

-- Index for querying by paid member
CREATE INDEX IF NOT EXISTS idx_merge_audit_paid_member
  ON identity_merge_audit ("paidMemberId");

-- Index for querying recent auto-merges (monitoring)
CREATE INDEX IF NOT EXISTS idx_merge_audit_action
  ON identity_merge_audit (action, timestamp)
  WHERE action = 'AUTO_MERGE';

-- RLS: サービスロールのみ
ALTER TABLE identity_merge_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only - merge_audit" ON identity_merge_audit
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE identity_merge_audit IS 'Identity Resolver merge decisions audit log (Phase 5-2)';
