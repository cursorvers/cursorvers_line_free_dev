-- ============================================
-- Security Brief: Phase 1 マイグレーション
-- hij_raw テーブル + sec_brief テーブル
-- ============================================

-- 1. sec_brief_status enum
-- ドラフト → 公開 → アーカイブ のワークフロー用
CREATE TYPE sec_brief_status AS ENUM ('draft', 'published', 'archived');

-- 2. hij_raw テーブル
-- Health-ISAC Japan からの生メールデータを格納
CREATE TABLE IF NOT EXISTS hij_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT UNIQUE,                    -- GmailのMessage-ID（重複防止）
  sent_at TIMESTAMPTZ NOT NULL,              -- メール送信日時
  subject TEXT,                              -- メール件名
  tlp TEXT,                                  -- TLP:GREEN, TLP:AMBER 等
  raw_text TEXT NOT NULL,                    -- プレーンテキスト本文
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- インデックス: sent_at での範囲検索を高速化
CREATE INDEX IF NOT EXISTS idx_hij_raw_sent_at ON hij_raw(sent_at);

-- インデックス: tlp でのフィルタリング用
CREATE INDEX IF NOT EXISTS idx_hij_raw_tlp ON hij_raw(tlp);

-- 3. sec_brief テーブル
-- 週次セキュリティ・ブリーフの生成結果を格納
CREATE TABLE IF NOT EXISTS sec_brief (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,                  -- その週の開始日（月曜など）
  title TEXT NOT NULL,                       -- ブリーフのタイトル
  topics JSONB NOT NULL,                     -- トピック配列（構造化データ）
  mindmap TEXT NOT NULL,                     -- テキスト形式のマインドマップ
  body_markdown TEXT NOT NULL,               -- Discord投稿用の完成済みMarkdown
  source_ids UUID[] NOT NULL,                -- 参照した hij_raw.id の配列
  status sec_brief_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  published_at TIMESTAMPTZ                   -- 公開日時（publishedに変更時に設定）
);

-- インデックス: week_start での検索用
CREATE INDEX IF NOT EXISTS idx_sec_brief_week_start ON sec_brief(week_start);

-- インデックス: status でのフィルタリング用
CREATE INDEX IF NOT EXISTS idx_sec_brief_status ON sec_brief(status);

-- 4. RLS（Row Level Security）設定
-- これらのテーブルはサーバーサイド専用。クライアント直叩きは禁止。
ALTER TABLE hij_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE sec_brief ENABLE ROW LEVEL SECURITY;

-- サービスロールのみアクセス可能（Edge Functions から service_role key で操作）
-- anon / authenticated ユーザーからは一切アクセス不可
CREATE POLICY "Service role only - hij_raw" ON hij_raw
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only - sec_brief" ON sec_brief
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- コメント
-- ============================================
COMMENT ON TABLE hij_raw IS 'Health-ISAC Japan から受信した生メールデータ。TLP:GREEN/AMBER等のラベル付き。';
COMMENT ON TABLE sec_brief IS '週次セキュリティ・ブリーフ。LLMで要約生成し、Discordへ公開する。';
COMMENT ON COLUMN hij_raw.tlp IS 'Traffic Light Protocol。GREEN=公開可、AMBER=限定共有、RED=非公開。';
COMMENT ON COLUMN sec_brief.topics IS 'SecBriefTopic[] 形式のJSONB。category, title, summary, impact_on_clinics, actions を含む。';
COMMENT ON COLUMN sec_brief.source_ids IS '要約生成に使用した hij_raw レコードのID配列。トレーサビリティ用。';

