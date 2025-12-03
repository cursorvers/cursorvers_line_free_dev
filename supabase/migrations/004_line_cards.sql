-- Migration: Create line_cards table for Obsidian -> LINE daily brief
-- Description: Stores card content extracted from Obsidian vault with #cv_line tag

-- Create enum for card themes
CREATE TYPE card_theme AS ENUM (
  'ai_gov',    -- 医療AIガバナンス
  'tax',       -- 税務・資産形成
  'law',       -- 法務・契約
  'biz',       -- Cursorvers事業戦略
  'career',    -- 医師キャリア・働き方
  'asset',     -- 個人の資産形成
  'general'    -- その他
);

-- Create enum for card status
CREATE TYPE card_status AS ENUM (
  'ready',     -- 配信可能
  'used',      -- 既に配信済み（再配信可）
  'archived'   -- アーカイブ済み（配信対象外）
);

-- Main table for LINE cards
CREATE TABLE IF NOT EXISTS line_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Card content
  body TEXT NOT NULL,
  theme card_theme NOT NULL DEFAULT 'general',
  
  -- Source tracking (Obsidian vault)
  source_path TEXT NOT NULL,
  source_line INTEGER,
  content_hash TEXT NOT NULL UNIQUE,  -- For deduplication
  
  -- Delivery status
  status card_status NOT NULL DEFAULT 'ready',
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Timestamps
  created_from_vault_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient card selection
CREATE INDEX idx_line_cards_status ON line_cards(status);
CREATE INDEX idx_line_cards_theme ON line_cards(theme);
CREATE INDEX idx_line_cards_times_used ON line_cards(times_used);
CREATE INDEX idx_line_cards_content_hash ON line_cards(content_hash);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_line_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
CREATE TRIGGER trigger_line_cards_updated_at
  BEFORE UPDATE ON line_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_line_cards_updated_at();

-- View for theme statistics (used in card selection)
CREATE OR REPLACE VIEW line_cards_theme_stats AS
SELECT 
  theme,
  COUNT(*) AS total_cards,
  SUM(times_used) AS total_times_used,
  COUNT(*) FILTER (WHERE status = 'ready') AS ready_cards
FROM line_cards
GROUP BY theme;

-- RLS policies
ALTER TABLE line_cards ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access" ON line_cards
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE line_cards IS 'LINE daily brief用のカードコンテンツ（Obsidian Vaultから同期）';
COMMENT ON COLUMN line_cards.body IS 'LINEに配信する本文（タグ削除済み）';
COMMENT ON COLUMN line_cards.theme IS 'カードのテーマ分類';
COMMENT ON COLUMN line_cards.source_path IS 'Obsidian内のファイルパス';
COMMENT ON COLUMN line_cards.source_line IS '元になった行番号';
COMMENT ON COLUMN line_cards.content_hash IS '重複チェック用のハッシュ（source_path + source_line + body）';
COMMENT ON COLUMN line_cards.status IS 'カードの状態（ready/used/archived）';
COMMENT ON COLUMN line_cards.times_used IS '配信回数';
COMMENT ON COLUMN line_cards.last_used_at IS '最後に配信した日時';
COMMENT ON COLUMN line_cards.created_from_vault_at IS 'Obsidianから取り込んだ日時';

