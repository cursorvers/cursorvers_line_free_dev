-- Helper functions and indexes for LINE Daily Brief

-- Aggregate theme stats in the database (used by Edge Function)
CREATE OR REPLACE FUNCTION get_theme_stats()
RETURNS TABLE (
  theme card_theme,
  total_times_used INTEGER,
  ready_count INTEGER
) LANGUAGE sql AS $$
  SELECT
    theme,
    COALESCE(SUM(times_used), 0)::INTEGER AS total_times_used,
    COUNT(*) FILTER (WHERE status = 'ready')::INTEGER AS ready_count
  FROM line_cards
  GROUP BY theme;
$$;

-- Atomically increment times_used and mark as used
CREATE OR REPLACE FUNCTION increment_times_used(card_id UUID)
RETURNS line_cards
LANGUAGE sql AS $$
  UPDATE line_cards
  SET
    times_used = times_used + 1,
    last_used_at = NOW(),
    status = 'used'
  WHERE id = card_id
  RETURNING *;
$$;

-- Composite index for faster selection by theme/status/times_used
CREATE INDEX IF NOT EXISTS idx_line_cards_theme_status_times_used
  ON line_cards (theme, status, times_used);
