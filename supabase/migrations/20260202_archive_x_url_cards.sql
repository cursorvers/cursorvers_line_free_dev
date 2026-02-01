-- Migration: Archive LINE cards containing X/Twitter URLs
-- Description: Phase 2 of X URL removal - archive existing cards with X/Twitter URLs
-- Date: 2026-02-02
-- Related: Phase 1 completed - URL validator (94.5% coverage) + PII masker (100%)
--          Phase 2 completed - Obsidian extractor X URL validation (6/6 tests passed)

-- Step 1: DRY RUN - Show cards that will be archived (for verification)
-- Uncomment the following query to preview affected cards:

/*
SELECT
  id,
  LEFT(body, 100) AS body_preview,
  theme,
  status,
  source_path,
  source_line,
  created_at
FROM line_cards
WHERE
  status != 'archived'
  AND (
    body ILIKE '%twitter.com%'
    OR body ILIKE '%x.com%'
    OR body ~ 'https?://[^\s]*(twitter\.com|x\.com)[^\s]*'
  )
ORDER BY created_at DESC;
*/

-- Step 2: Archive cards containing X/Twitter URLs
-- Update status to 'archived' for cards with X URLs

UPDATE line_cards
SET
  status = 'archived',
  updated_at = NOW()
WHERE
  status != 'archived'
  AND (
    -- Case-insensitive search for twitter.com or x.com
    body ILIKE '%twitter.com%'
    OR body ILIKE '%x.com%'
    -- Regex pattern for URL detection (more strict)
    OR body ~ 'https?://[^\s]*(twitter\.com|x\.com)[^\s]*'
  );

-- Step 3: Log the migration result
-- Insert a record to track this migration execution

DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  GET DIAGNOSTICS affected_count = ROW_COUNT;

  RAISE NOTICE 'Migration completed: % cards archived', affected_count;

  -- You can also log to a separate migration_log table if it exists
  -- INSERT INTO migration_log (migration_name, affected_rows, executed_at)
  -- VALUES ('20260202_archive_x_url_cards', affected_count, NOW());
END $$;

-- Step 4: Verify the result
-- Show summary statistics after migration

SELECT
  status,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE body ILIKE '%twitter.com%' OR body ILIKE '%x.com%') AS with_x_url
FROM line_cards
GROUP BY status
ORDER BY status;

-- Comments for documentation
COMMENT ON TABLE line_cards IS 'LINE daily brief用のカードコンテンツ（Obsidian Vaultから同期）- X URL除外対応完了';
