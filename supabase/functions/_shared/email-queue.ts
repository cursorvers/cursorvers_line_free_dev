/**
 * Email Send Queue Module
 * Failed emails are queued for retry with exponential backoff
 *
 * Queue flow:
 * 1. Email fails in webhook → enqueueEmail()
 * 2. Cron triggers retry-failed-emails function
 * 3. reclaimStaleProcessing() recovers stuck items
 * 4. fetchRetryableItems() picks up pending/failed items
 * 5. markProcessing() claims with lease token (30 min TTL)
 * 6. Retries with exponential backoff (1m, 5m, 30m, 2h, 12h)
 * 7. markSent/markFailed require token match
 * 8. After max_attempts → dead_letter
 */
import { type SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "./logger.ts";
import { extractErrorMessage } from "./error-utils.ts";
import { maskEmail } from "./masking-utils.ts";

const log = createLogger("email-queue");

const MAX_LAST_ERROR_LENGTH = 500;

/** Lease TTL in seconds (30 minutes) */
const LEASE_TTL_SECONDS = 1800;

// Exponential backoff schedule (in seconds)
const RETRY_DELAYS_SECONDS = [
  60,       // 1 minute
  300,      // 5 minutes
  1800,     // 30 minutes
  7200,     // 2 hours
  43200,    // 12 hours
] as const;

// Allowlist: only persist safe fields per template (never store secrets)
const ALLOWED_PARAMS: Record<string, readonly string[]> = {
  paid_member_welcome: ["tier_display_name"],
  reminder: ["tier_display_name", "days_since_purchase"],
  direct_discord_invite: ["tier_display_name", "discord_invite_url"],
} as const;

export interface EmailQueueItem {
  event_id: string;
  recipient_email: string;
  template: string;
  params: Record<string, unknown>;
}

export interface QueueResult {
  success: boolean;
  queueId?: string;
  error?: string;
}

export interface ClaimResult {
  claimed: boolean;
  token?: string;
}

/**
 * Enqueue a failed email for retry
 * Called from stripe-webhook when sendPaidMemberWelcomeEmail fails
 */
export async function enqueueEmail(
  supabase: SupabaseClient,
  item: EmailQueueItem,
): Promise<QueueResult> {
  try {
    const allowedKeys = ALLOWED_PARAMS[item.template] ?? [];
    const safeParams: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in item.params) {
        safeParams[key] = item.params[key];
      }
    }

    const { data, error } = await supabase
      .from("email_send_queue")
      .insert({
        event_id: item.event_id,
        recipient_email: item.recipient_email,
        template: item.template,
        params: safeParams,
        status: "pending",
        attempts: 0,
        max_attempts: 5,
        next_retry_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      // UNIQUE constraint violation = already queued (idempotent success)
      if (error.code === "23505") {
        log.info("Email already queued (idempotent)", {
          email: maskEmail(item.recipient_email),
          template: item.template,
        });
        return { success: true, queueId: "existing" };
      }
      log.error("Failed to enqueue email", {
        email: maskEmail(item.recipient_email),
        error: error.message,
      });
      return { success: false, error: error.message };
    }

    log.info("Email enqueued for retry", {
      queueId: data.id,
      email: maskEmail(item.recipient_email),
      template: item.template,
    });

    return { success: true, queueId: data.id };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Email queue insert exception", { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Calculate next retry time based on attempt number
 */
export function getNextRetryAt(attempts: number): Date {
  const delayIndex = Math.min(attempts, RETRY_DELAYS_SECONDS.length - 1);
  const delaySec = RETRY_DELAYS_SECONDS[delayIndex];
  return new Date(Date.now() + delaySec * 1000);
}

/**
 * Reclaim stale processing items whose lease has expired.
 * Sets them back to 'failed' so they can be retried.
 * Should be called at the start of each retry cycle.
 */
export async function reclaimStaleProcessing(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase
    .from("email_send_queue")
    .update({
      status: "failed",
      last_error: "Lease expired — reclaimed from stale processing",
      processing_token: null,
      lease_expires_at: null,
    })
    .eq("status", "processing")
    .lte("lease_expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    log.error("Failed to reclaim stale processing items", {
      error: error.message,
    });
    return 0;
  }

  const count = data?.length ?? 0;
  if (count > 0) {
    log.warn("Reclaimed stale processing items", { count });
  }
  return count;
}

/**
 * Fetch items ready for retry (pending or failed, next_retry_at <= now)
 */
export async function fetchRetryableItems(
  supabase: SupabaseClient,
  limit = 10,
): Promise<{
  items: Array<{
    id: string;
    event_id: string;
    recipient_email: string;
    template: string;
    params: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  }>;
  error?: string;
}> {
  const { data, error } = await supabase
    .from("email_send_queue")
    .select("id, event_id, recipient_email, template, params, attempts, max_attempts")
    .in("status", ["pending", "failed"])
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { items: [], error: error.message };
  }

  return { items: data ?? [] };
}

/**
 * Mark queue item as processing (claim it) with lease token.
 * Returns a token that must be passed to markSent/markFailed.
 */
export async function markProcessing(
  supabase: SupabaseClient,
  queueId: string,
): Promise<ClaimResult> {
  const token = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + LEASE_TTL_SECONDS * 1000).toISOString();

  // Atomic claim: update only if still pending/failed, check row count
  const { data, error } = await supabase
    .from("email_send_queue")
    .update({
      status: "processing",
      processing_token: token,
      lease_expires_at: leaseExpiresAt,
    })
    .eq("id", queueId)
    .in("status", ["pending", "failed"])
    .select("id");

  if (error) return { claimed: false };
  // If no rows returned, another worker already claimed this item
  if ((data?.length ?? 0) === 0) return { claimed: false };

  return { claimed: true, token };
}

/**
 * Check if a lease is still valid (not expired)
 */
export function isLeaseValid(leaseExpiresAt: Date): boolean {
  return leaseExpiresAt > new Date();
}

/**
 * Mark queue item as sent (success).
 * Requires matching processing_token to prevent stale worker overwrites.
 */
export async function markSent(
  supabase: SupabaseClient,
  queueId: string,
  token?: string,
): Promise<boolean> {
  // Build query with token match if provided
  let query = supabase
    .from("email_send_queue")
    .update({
      status: "sent",
      processing_token: null,
      lease_expires_at: null,
    })
    .eq("id", queueId);

  if (token) {
    query = query.eq("processing_token", token);
  }

  const { data, error } = await query.select("id");

  if (error) {
    log.error("Failed to mark queue item as sent", {
      queueId,
      error: error.message,
    });
    return false;
  }

  if ((data?.length ?? 0) === 0) {
    log.warn("markSent: no rows updated (lease expired or token mismatch)", {
      queueId,
    });
    return false;
  }

  return true;
}

/**
 * Sanitize error message: truncate and remove potential PII
 */
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[JWT]")
    .replace(/https?:\/\/discord\.gg\/\S+/g, "[DISCORD_INVITE]")
    .slice(0, MAX_LAST_ERROR_LENGTH);
}

/**
 * Mark queue item as failed with retry scheduling or dead letter.
 * Requires matching processing_token to prevent stale worker overwrites.
 */
export async function markFailed(
  supabase: SupabaseClient,
  queueId: string,
  attempts: number,
  maxAttempts: number,
  errorMessage: string,
  token?: string,
): Promise<boolean> {
  const isExhausted = attempts + 1 >= maxAttempts;
  const nextStatus = isExhausted ? "dead_letter" : "failed";
  const nextRetryAt = isExhausted
    ? new Date().toISOString()
    : getNextRetryAt(attempts + 1).toISOString();

  let query = supabase
    .from("email_send_queue")
    .update({
      status: nextStatus,
      attempts: attempts + 1,
      next_retry_at: nextRetryAt,
      last_error: sanitizeErrorMessage(errorMessage),
      processing_token: null,
      lease_expires_at: null,
    })
    .eq("id", queueId);

  if (token) {
    query = query.eq("processing_token", token);
  }

  const { data, error } = await query.select("id");

  if (error) {
    log.error("Failed to mark queue item as failed", {
      queueId,
      error: error.message,
    });
    return false;
  }

  if (token && (data?.length ?? 0) === 0) {
    log.warn("markFailed: no rows updated (lease expired or token mismatch)", {
      queueId,
    });
    return false;
  }

  return true;
}
