-- 016_note_articles.sql
-- Discord Forum 記事ライブラリ用テーブル
-- note.com 記事のメタデータ + Discord Forum スレッド ID を管理

CREATE TABLE IF NOT EXISTS note_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id TEXT UNIQUE NOT NULL,       -- note-recommendations.ts の id
  title TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  tags TEXT[] DEFAULT '{}',
  course_keyword TEXT,                    -- 所属する診断コース名
  discord_thread_id TEXT,                 -- Forum スレッド投稿後に記録
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_note_articles_discord
  ON note_articles(discord_thread_id)
  WHERE discord_thread_id IS NOT NULL;

COMMENT ON TABLE note_articles IS 'Discord Forum 記事ライブラリ: note.com 記事メタデータ + Forum スレッド連携';
