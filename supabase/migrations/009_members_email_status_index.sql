-- 複合インデックスで email + status を高速化
CREATE INDEX IF NOT EXISTS idx_members_email_status
  ON members(email, status);

