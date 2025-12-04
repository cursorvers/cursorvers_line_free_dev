-- Migration: Create line_card_broadcasts table for tracking delivery history
-- Description: Records successful and failed broadcasts for monitoring and analytics

CREATE TABLE IF NOT EXISTS line_card_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to the card that was broadcast
  card_id UUID NOT NULL REFERENCES line_cards(id) ON DELETE CASCADE,
  
  -- Broadcast metadata
  theme card_theme NOT NULL,
  broadcast_status TEXT NOT NULL, -- 'success' | 'failed'
  error_message TEXT, -- Only set when broadcast_status = 'failed'
  
  -- LINE API response
  line_request_id TEXT, -- X-Line-Request-Id from LINE API
  line_response_status INTEGER, -- HTTP status code from LINE API
  
  -- Timestamps
  broadcasted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_line_card_broadcasts_card_id ON line_card_broadcasts(card_id);
CREATE INDEX idx_line_card_broadcasts_broadcasted_at ON line_card_broadcasts(broadcasted_at);
CREATE INDEX idx_line_card_broadcasts_status ON line_card_broadcasts(broadcast_status);
CREATE INDEX idx_line_card_broadcasts_theme ON line_card_broadcasts(theme);

-- View for daily broadcast statistics
CREATE OR REPLACE VIEW line_card_broadcasts_daily_stats AS
SELECT 
  DATE(broadcasted_at) as date,
  COUNT(*) as total_broadcasts,
  COUNT(*) FILTER (WHERE broadcast_status = 'success') as successful_broadcasts,
  COUNT(*) FILTER (WHERE broadcast_status = 'failed') as failed_broadcasts,
  COUNT(DISTINCT theme) as themes_used
FROM line_card_broadcasts
GROUP BY DATE(broadcasted_at)
ORDER BY date DESC;

-- View for theme distribution statistics
CREATE OR REPLACE VIEW line_card_broadcasts_theme_stats AS
SELECT 
  theme,
  COUNT(*) as total_broadcasts,
  COUNT(*) FILTER (WHERE broadcast_status = 'success') as successful_broadcasts,
  COUNT(*) FILTER (WHERE broadcast_status = 'failed') as failed_broadcasts,
  MAX(broadcasted_at) as last_broadcasted_at
FROM line_card_broadcasts
GROUP BY theme
ORDER BY total_broadcasts DESC;

-- RLS policies
ALTER TABLE line_card_broadcasts ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access" ON line_card_broadcasts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE line_card_broadcasts IS 'LINE Daily Brief配信履歴（成功/失敗を記録）';
COMMENT ON COLUMN line_card_broadcasts.card_id IS '配信したカードのID';
COMMENT ON COLUMN line_card_broadcasts.broadcast_status IS '配信ステータス（success/failed）';
COMMENT ON COLUMN line_card_broadcasts.line_request_id IS 'LINE APIから返されたリクエストID';
COMMENT ON COLUMN line_card_broadcasts.broadcasted_at IS '配信実行日時';

