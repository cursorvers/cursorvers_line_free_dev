-- Add missing columns for idempotency lease/retry mechanism
-- Required by _shared/idempotency.ts claimEvent/markFailed/markSucceeded
-- Applied via Supabase MCP on 2026-03-16, committed here for GHA deploy pipeline

ALTER TABLE stripe_events_processed
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- Make processed_at nullable (set on success, not on initial insert)
ALTER TABLE stripe_events_processed
  ALTER COLUMN processed_at DROP NOT NULL,
  ALTER COLUMN processed_at SET DEFAULT NULL;

-- Add index for stale processing detection
CREATE INDEX IF NOT EXISTS idx_stripe_events_processing_lease
  ON stripe_events_processed (status, processing_started_at)
  WHERE status = 'processing';
