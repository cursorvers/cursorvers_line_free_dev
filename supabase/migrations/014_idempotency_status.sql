-- Phase 5-3: Idempotency Store state machine (Codex architect 案B)
-- State transitions: received → processing → succeeded | failed
-- Lease/timeout: stale 'processing' events auto-reset for retry
--
-- Additive migration only (no column removals) for rollback safety.

-- 1) status column (text + check constraint for minimal overhead)
ALTER TABLE stripe_events_processed
  ADD COLUMN IF NOT EXISTS status TEXT;

-- Backfill existing rows as 'succeeded' (they were already processed)
UPDATE stripe_events_processed SET status = 'succeeded' WHERE status IS NULL;

-- Set default for new inserts to 'received'
ALTER TABLE stripe_events_processed
  ALTER COLUMN status SET DEFAULT 'received';
ALTER TABLE stripe_events_processed
  ALTER COLUMN status SET NOT NULL;

-- 2) Additional columns (minimal set per Codex 案B)
ALTER TABLE stripe_events_processed
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
ALTER TABLE stripe_events_processed
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stripe_events_processed
  ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE stripe_events_processed
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- 3) Status constraint
ALTER TABLE stripe_events_processed
  ADD CONSTRAINT stripe_events_processed_status_check
  CHECK (status IN ('received', 'processing', 'succeeded', 'failed'));

-- 4) Indexes for re-drive and lease timeout scanning
CREATE INDEX IF NOT EXISTS idx_stripe_events_retry
  ON stripe_events_processed (status, next_retry_at)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_stripe_events_processing
  ON stripe_events_processed (status, processing_started_at)
  WHERE status = 'processing';

-- 5) Updated cleanup function with lease timeout handling
CREATE OR REPLACE FUNCTION cleanup_old_stripe_events()
RETURNS void AS $$
BEGIN
  -- Clean up succeeded events older than 30 days
  DELETE FROM stripe_events_processed
  WHERE processed_at < now() - INTERVAL '30 days'
    AND status = 'succeeded';

  -- Clean up failed events older than 90 days (longer retention for audit)
  DELETE FROM stripe_events_processed
  WHERE processed_at < now() - INTERVAL '90 days'
    AND status = 'failed';

  -- Reset stale processing events (lease expired > 5 minutes) for retry
  UPDATE stripe_events_processed
  SET status = 'received',
      processing_started_at = NULL,
      next_retry_at = now()
  WHERE status = 'processing'
    AND processing_started_at < now() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN stripe_events_processed.status IS 'Event processing state: received → processing → succeeded | failed';
COMMENT ON COLUMN stripe_events_processed.processing_started_at IS 'Timestamp when processing was claimed (lease start)';
COMMENT ON COLUMN stripe_events_processed.attempts IS 'Number of processing attempts (safety valve at 10)';
COMMENT ON COLUMN stripe_events_processed.last_error IS 'Error details for the most recent failure';
COMMENT ON COLUMN stripe_events_processed.next_retry_at IS 'Earliest time for re-drive attempt';
