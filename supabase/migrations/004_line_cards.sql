-- ============================================
-- LINE Cards: Obsidian → LINE 配信用カードテーブル
-- ============================================

-- 1. theme enum
-- カードのテーマ分類
CREATE TYPE line_card_theme AS ENUM (
  'ai_gov',    -- 医療AIガバナンス
  'tax',       -- 税務・資産形成
  'law',       -- 法務・契約
  'biz',       -- Cursorvers事業戦略
  'career',    -- 医師キャリア・働き方
  'asset',     -- 個人の資産形成
  'general'    -- その他/未分類
);

-- 2. status enum
-- カードの状態管理
CREATE TYPE line_card_status AS ENUM (
  'ready',     -- 配信可能
  'used',      -- 配信済み（再利用可）
  'archived'   -- アーカイブ（配信対象外）
);

-- 3. line_cards テーブル
CREATE TABLE IF NOT EXISTS line_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- カード本文（タグ削除済み、LINE配信用）
  body TEXT NOT NULL,
  
  -- テーマ分類
  theme line_card_theme NOT NULL DEFAULT 'general',
  
  -- Obsidian ソース情報
  source_path TEXT NOT NULL,           -- Vault内のファイルパス
  source_line INTEGER,                 -- 元になった行番号
  content_hash TEXT UNIQUE NOT NULL,   -- 重複防止用ハッシュ
  
  -- 配信状態管理
  status line_card_status NOT NULL DEFAULT 'ready',
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- タイムスタンプ
  created_from_vault_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_line_cards_status ON line_cards(status);
CREATE INDEX IF NOT EXISTS idx_line_cards_theme ON line_cards(theme);
CREATE INDEX IF NOT EXISTS idx_line_cards_times_used ON line_cards(times_used);
CREATE INDEX IF NOT EXISTS idx_line_cards_content_hash ON line_cards(content_hash);

-- 4. RLS 設定
ALTER TABLE line_cards ENABLE ROW LEVEL SECURITY;

-- サービスロールのみアクセス可能
CREATE POLICY "Service role only - line_cards" ON line_cards
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 5. 配信履歴テーブル（オプション：配信ログ用）
CREATE TABLE IF NOT EXISTS line_card_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES line_cards(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_count INTEGER,  -- 配信先人数（LINE APIから取得できれば）
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_line_card_broadcasts_card_id ON line_card_broadcasts(card_id);
CREATE INDEX IF NOT EXISTS idx_line_card_broadcasts_sent_at ON line_card_broadcasts(sent_at);

ALTER TABLE line_card_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only - line_card_broadcasts" ON line_card_broadcasts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 6. コメント
COMMENT ON TABLE line_cards IS 'Obsidianから抽出したLINE配信用カード。#cv_lineタグ付き行から生成。';
COMMENT ON COLUMN line_cards.body IS 'LINE配信用の本文。タグは削除済み。';
COMMENT ON COLUMN line_cards.theme IS 'カードのテーマ分類。配信時のバランス調整に使用。';
COMMENT ON COLUMN line_cards.content_hash IS 'source_path + source_line + body から算出したハッシュ。重複防止用。';
COMMENT ON COLUMN line_cards.times_used IS '配信回数。少ないカードを優先的に配信。';
COMMENT ON TABLE line_card_broadcasts IS 'LINE配信履歴。デバッグ・分析用。';

