/**
 * Idempotency Store - Event processing state machine
 *
 * State transitions: received → processing → succeeded | failed
 * Lease/timeout: stale 'processing' events auto-reset for retry
 * Max attempts: safety valve to prevent infinite retries
 *
 * @see Plans.md Phase 5-3
 */

import { createLogger } from "./logger.ts";

const log = createLogger("idempotency");

// ============================================
// Types
// ============================================

export type EventStatus = "received" | "processing" | "succeeded" | "failed";

export interface EventClaimResult {
  readonly claimed: boolean;
  readonly reason:
    | "CLAIMED"
    | "ALREADY_SUCCEEDED"
    | "ALREADY_PROCESSING"
    | "MAX_ATTEMPTS_EXCEEDED"
    | "CLAIM_CONFLICT";
}

// ============================================
// Constants
// ============================================

/** Max processing attempts before permanent failure */
const MAX_ATTEMPTS = 10;

/** Lease timeout in minutes (stale processing events are reset) */
const LEASE_TIMEOUT_MINUTES = 5;

// ============================================
// Core Functions
// ============================================

/**
 * Attempt to claim an event for processing.
 *
 * Flow:
 * 1. Check if event exists
 * 2. If not → insert with status='received', then claim
 * 3. If exists and 'succeeded' → skip
 * 4. If exists and 'processing' within lease → skip
 * 5. If exists and 'failed' or stale 'processing' → re-claim
 * 6. Update to 'processing' with conditional WHERE
 */
export async function claimEvent(
  // deno-lint-ignore no-explicit-any
  supabase: { from: (table: string) => any },
  eventId: string,
  eventType: string,
  customerEmail: string | null,
): Promise<EventClaimResult> {
  // Step 1: Check existing record
  const { data: existing } = await supabase
    .from("stripe_events_processed")
    .select("event_id, status, processing_started_at, attempts")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!existing) {
    // Step 2: New event → insert as 'received'
    const { error: insertError } = await supabase
      .from("stripe_events_processed")
      .insert({
        event_id: eventId,
        event_type: eventType,
        customer_email: customerEmail,
        status: "received",
        attempts: 0,
      });

    if (insertError) {
      // Unique constraint violation → concurrent insert, re-check
      if (insertError.code === "23505") {
        log.info("Concurrent insert detected, re-checking", { eventId });
        return claimEvent(supabase, eventId, eventType, customerEmail);
      }
      log.error("Failed to insert event record", {
        eventId,
        error: insertError.message,
      });
      return { claimed: false, reason: "CLAIM_CONFLICT" };
    }
  } else {
    // Step 3: Already succeeded → skip
    if (existing.status === "succeeded") {
      log.info("Event already processed successfully", { eventId });
      return { claimed: false, reason: "ALREADY_SUCCEEDED" };
    }

    // Step 4: Currently processing within lease → skip
    if (existing.status === "processing" && existing.processing_started_at) {
      const startedAt = new Date(existing.processing_started_at);
      const leaseExpiry = new Date(
        startedAt.getTime() + LEASE_TIMEOUT_MINUTES * 60 * 1000,
      );
      if (new Date() < leaseExpiry) {
        log.info("Event currently being processed (lease active)", { eventId });
        return { claimed: false, reason: "ALREADY_PROCESSING" };
      }
      log.warn("Processing lease expired, re-claiming", { eventId });
    }

    // Step 5: Check max attempts
    if ((existing.attempts ?? 0) >= MAX_ATTEMPTS) {
      log.error("Max attempts exceeded for event", {
        eventId,
        attempts: existing.attempts,
      });
      return { claimed: false, reason: "MAX_ATTEMPTS_EXCEEDED" };
    }
  }

  // Step 6: Claim → update to 'processing'
  const { error: updateError, count } = await supabase
    .from("stripe_events_processed")
    .update({
      status: "processing",
      processing_started_at: new Date().toISOString(),
      attempts: (existing?.attempts ?? 0) + 1,
      last_error: null,
    })
    .eq("event_id", eventId)
    .in("status", ["received", "failed", "processing"])
    .select("event_id");

  if (updateError || (count !== undefined && count === 0)) {
    log.warn("Failed to claim event (concurrent claim)", { eventId });
    return { claimed: false, reason: "CLAIM_CONFLICT" };
  }

  log.info("Event claimed for processing", {
    eventId,
    attempt: (existing?.attempts ?? 0) + 1,
  });
  return { claimed: true, reason: "CLAIMED" };
}

/**
 * Mark an event as successfully processed.
 */
export async function markSucceeded(
  // deno-lint-ignore no-explicit-any
  supabase: { from: (table: string) => any },
  eventId: string,
): Promise<void> {
  const { error } = await supabase
    .from("stripe_events_processed")
    .update({
      status: "succeeded",
      processed_at: new Date().toISOString(),
      last_error: null,
      next_retry_at: null,
    })
    .eq("event_id", eventId);

  if (error) {
    log.error("Failed to mark event as succeeded", {
      eventId,
      error: error.message,
    });
  } else {
    log.info("Event marked as succeeded", { eventId });
  }
}

/**
 * Mark an event as failed with error details and schedule retry.
 */
export async function markFailed(
  // deno-lint-ignore no-explicit-any
  supabase: { from: (table: string) => any },
  eventId: string,
  errorMessage: string,
): Promise<void> {
  // Exponential backoff: 1min, 2min, 4min, 8min, ...
  const { data: record } = await supabase
    .from("stripe_events_processed")
    .select("attempts")
    .eq("event_id", eventId)
    .maybeSingle();

  const attempts = record?.attempts ?? 1;
  const backoffMinutes = Math.min(Math.pow(2, attempts - 1), 60);
  const nextRetryAt = new Date(
    Date.now() + backoffMinutes * 60 * 1000,
  ).toISOString();

  const { error } = await supabase
    .from("stripe_events_processed")
    .update({
      status: "failed",
      last_error: errorMessage.slice(0, 1000),
      next_retry_at: nextRetryAt,
    })
    .eq("event_id", eventId);

  if (error) {
    log.error("Failed to mark event as failed", {
      eventId,
      error: error.message,
    });
  } else {
    log.warn("Event marked as failed", {
      eventId,
      errorMessage: errorMessage.slice(0, 100),
      nextRetryAt,
      attempt: attempts,
    });
  }
}
