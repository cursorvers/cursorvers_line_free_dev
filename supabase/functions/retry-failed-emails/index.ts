/**
 * Retry Failed Emails Edge Function
 * Cron-triggered function that processes the email_send_queue
 *
 * Schedule: Every 15 minutes (via pg_cron)
 * Endpoint: POST /retry-failed-emails (with cron secret auth)
 *
 * Lease-based processing:
 * 1. Reclaim stale processing items (lease expired)
 * 2. Fetch retryable items (pending/failed)
 * 3. Claim with lease token (30 min TTL)
 * 4. Verify lease before sending
 * 5. Mark sent/failed with token match
 */
import { createClient } from "@supabase/supabase-js";
import { createLogger } from "../_shared/logger.ts";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { maskEmail } from "../_shared/masking-utils.ts";
import { notifyDiscord } from "../_shared/alert.ts";
import {
  sendPaidMemberWelcomeEmail,
  sendReminderEmail,
  sendDirectDiscordInviteEmail,
} from "../_shared/email.ts";
import {
  reclaimStaleProcessing,
  fetchRetryableItems,
  markProcessing,
  markSent,
  markFailed,
} from "../_shared/email-queue.ts";

const log = createLogger("retry-failed-emails");

/** Default days_since_purchase when value is invalid */
const DEFAULT_DAYS_SINCE_PURCHASE = 7;

// Template dispatcher: maps template names to send functions
async function sendByTemplate(
  template: string,
  email: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  switch (template) {
    case "paid_member_welcome": {
      const code = params["verification_code_from_member"] as string | undefined;
      const tier = (params["tier_display_name"] as string) ?? "Library Member";

      if (!code) {
        return {
          success: false,
          error: "verification_code not available — manual intervention required",
        };
      }
      return await sendPaidMemberWelcomeEmail(email, code, tier);
    }

    case "reminder": {
      const code = params["verification_code_from_member"] as string | undefined;
      const rawDays = params["days_since_purchase"];
      const parsedDays = Number(rawDays);
      const days = (Number.isFinite(parsedDays) && parsedDays >= 0)
        ? parsedDays
        : DEFAULT_DAYS_SINCE_PURCHASE;
      if (!code) {
        return {
          success: false,
          error: "verification_code not available for reminder",
        };
      }
      return await sendReminderEmail(email, code, days);
    }

    case "direct_discord_invite": {
      const inviteUrl = params["discord_invite_url"] as string | undefined;
      const tier = (params["tier_display_name"] as string) ?? "Library Member";
      if (!inviteUrl) {
        return { success: false, error: "discord_invite_url not available" };
      }
      return await sendDirectDiscordInviteEmail(email, inviteUrl, tier);
    }

    default:
      return { success: false, error: `Unknown template: ${template}` };
  }
}

Deno.serve(async (req) => {
  try {
    // Auth check: strict — cron secret required (no open Bearer fallback)
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedSecret = req.headers.get("x-cron-secret");

    if (!cronSecret) {
      log.error("CRON_SECRET not configured");
      return new Response("Server configuration error", { status: 500 });
    }

    if (providedSecret !== cronSecret) {
      log.warn("Unauthorized retry-failed-emails attempt");
      return new Response("Unauthorized", { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      log.error("Supabase configuration missing");
      return new Response("Server configuration error", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Reclaim stale processing items (lease expired)
    const reclaimed = await reclaimStaleProcessing(supabase);
    if (reclaimed > 0) {
      log.info("Reclaimed stale items before processing", { reclaimed });
    }

    // Step 2: Fetch items ready for retry
    const { items, error: fetchError } = await fetchRetryableItems(supabase, 10);

    if (fetchError) {
      log.error("Failed to fetch retryable items", { error: fetchError });
      return new Response(JSON.stringify({ error: fetchError }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, reclaimed, message: "No items to retry" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    log.info("Processing email retry queue", { count: items.length });

    let succeeded = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const item of items) {
      // Step 3: Claim the item with lease token
      const claim = await markProcessing(supabase, item.id);
      if (!claim.claimed || !claim.token) {
        log.info("Item already claimed, skipping", { queueId: item.id });
        continue;
      }

      const token = claim.token;

      // For paid_member_welcome/reminder, fetch verification code from members table
      const baseParams = (item.params && typeof item.params === "object")
        ? item.params
        : {};
      const enrichedParams = { ...baseParams };

      if (
        item.template === "paid_member_welcome" ||
        item.template === "reminder"
      ) {
        const { data: member, error: memberError } = await supabase
          .from("members")
          .select("verification_code, verification_expires_at")
          .eq("email", item.recipient_email)
          .maybeSingle();

        if (memberError) {
          log.error("Failed to fetch member for verification code", {
            queueId: item.id,
            email: maskEmail(item.recipient_email),
            error: memberError.message,
          });
          await markFailed(supabase, item.id, item.attempts, item.max_attempts, `DB error: ${memberError.message}`, token);
          failed++;
          continue;
        }

        if (member?.verification_code && member?.verification_expires_at) {
          const expiresAt = new Date(member.verification_expires_at);
          if (expiresAt > new Date()) {
            enrichedParams["verification_code_from_member"] =
              member.verification_code;
          } else {
            // Code expired — dead letter, requires manual intervention
            log.warn("Verification code expired, dead-lettering", {
              queueId: item.id,
              email: maskEmail(item.recipient_email),
            });
            await markFailed(supabase, item.id, item.max_attempts - 1, item.max_attempts, "Verification code expired", token);
            await notifyDiscord({
              title: "MANUS ALERT: Email dead-lettered (code expired)",
              message: `Email to ${maskEmail(item.recipient_email)} dead-lettered: verification code expired.\nTemplate: ${item.template}\nEvent: ${item.event_id}`,
              severity: "error",
            });
            deadLettered++;
            continue;
          }
        }
      }

      const result = await sendByTemplate(
        item.template,
        item.recipient_email,
        enrichedParams,
      );

      if (result.success) {
        const marked = await markSent(supabase, item.id, token);
        if (marked) {
          succeeded++;
          log.info("Email retry succeeded", {
            queueId: item.id,
            email: maskEmail(item.recipient_email),
            attempt: item.attempts + 1,
          });
        } else {
          // Token mismatch — lease expired during send, another worker may have reclaimed
          log.warn("Email sent but markSent failed (lease expired?)", {
            queueId: item.id,
          });
          succeeded++;
        }
      } else {
        const isExhausted = item.attempts + 1 >= item.max_attempts;
        await markFailed(
          supabase,
          item.id,
          item.attempts,
          item.max_attempts,
          result.error ?? "Unknown error",
          token,
        );

        if (isExhausted) {
          deadLettered++;
          log.error("Email permanently failed (dead letter)", {
            queueId: item.id,
            email: maskEmail(item.recipient_email),
            attempts: item.attempts + 1,
          });
          await notifyDiscord({
            title: "MANUS ALERT: Email dead-lettered",
            message: `Email to ${maskEmail(item.recipient_email)} failed after ${item.max_attempts} attempts.\nTemplate: ${item.template}\nEvent: ${item.event_id}`,
            severity: "error",
          });
        } else {
          failed++;
          log.warn("Email retry failed, will retry later", {
            queueId: item.id,
            email: maskEmail(item.recipient_email),
            attempt: item.attempts + 1,
            error: result.error,
          });
        }
      }
    }

    const summary = { processed: items.length, reclaimed, succeeded, failed, deadLettered };
    log.info("Email retry queue processed", summary);

    return new Response(JSON.stringify(summary), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Unhandled error in retry-failed-emails", { error: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
