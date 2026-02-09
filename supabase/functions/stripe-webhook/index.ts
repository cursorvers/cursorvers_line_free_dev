/**
 * Stripe Webhook Edge Function
 * Router and validation layer - delegates to event-specific handlers
 *
 * Flow:
 * 1. Signature verification
 * 2. Rate limiting
 * 3. Idempotency state machine (claim event)
 * 4. Route to event handler
 * 5. Mark succeeded/failed
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { notifyDiscord } from "../_shared/alert.ts";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  claimEvent,
  markFailed,
  markSucceeded,
} from "../_shared/idempotency.ts";
import {
  checkRateLimit,
  getClientIP,
  recordRequest,
} from "./webhook-utils.ts";
import {
  handleChargeEvent,
  handleCheckoutCompleted,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "./event-handlers.ts";

const log = createLogger("stripe-webhook");

const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY") as string, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  try {
    const signature = req.headers.get("Stripe-Signature");
    const smokeTest = req.headers.get("x-smoke-test") === "true";
    const smokeMode = Deno.env.get("STRIPE_WEBHOOK_SMOKE_MODE") === "true";
    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const requestId = crypto.randomUUID();
    const clientIP = getClientIP(req);

    log.info("Request received", {
      requestId,
      clientIP,
      method: req.method,
    });

    // 環境変数の検証
    if (!webhookSecret) {
      log.error("STRIPE_WEBHOOK_SECRET not configured");
      await notifyDiscord({
        title: "MANUS ALERT: Stripe webhook secret missing",
        message: "STRIPE_WEBHOOK_SECRET not configured",
        severity: "critical",
      });
      return new Response("Server configuration error", { status: 500 });
    }

    // 署名ヘッダーの検証
    if (!signature) {
      log.warn("Missing Stripe-Signature header", { requestId, clientIP });
      await notifyDiscord({
        title: "MANUS ALERT: Stripe webhook missing signature",
        message: "Missing Stripe-Signature header",
        severity: "warning",
      });
      return new Response("Missing signature", { status: 400 });
    }

    let event;

    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        cryptoProvider,
      );
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
      log.error("Webhook signature verification failed", { errorMessage });
      await notifyDiscord({
        title: "MANUS ALERT: Stripe webhook signature failed",
        message: errorMessage,
        severity: "error",
      });
      return new Response(errorMessage, { status: 400 });
    }

    if (smokeMode && smokeTest) {
      log.info("Stripe webhook smoke test ok", {
        requestId,
        eventType: event.type,
      });
      return new Response(JSON.stringify({ received: true, smoke: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      log.error("Supabase configuration missing");
      await notifyDiscord({
        title: "MANUS ALERT: Supabase config missing",
        message: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured",
        severity: "critical",
      });
      return new Response("Server configuration error", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const isAllowed = await checkRateLimit(supabase, clientIP);
    if (!isAllowed) {
      log.warn("Rate limit exceeded", { requestId, clientIP });
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    await recordRequest(supabase, clientIP, true, {
      eventType: event.type,
      requestId,
    });

    // 冪等性状態機械: イベントをclaim（received→processing）
    const customerEmailForClaim =
      (event.data.object as { customer_details?: { email?: string } })
        ?.customer_details?.email ?? null;
    const claim = await claimEvent(
      supabase,
      event.id,
      event.type,
      customerEmailForClaim,
    );

    if (!claim.claimed) {
      log.info("Event not claimed, skipping", {
        eventId: event.id,
        eventType: event.type,
        reason: claim.reason,
      });
      return new Response(
        JSON.stringify({ received: true, skipped: claim.reason }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(
            supabase,
            stripe,
            event.data.object as Stripe.Checkout.Session,
          );
          break;
        case "customer.subscription.updated":
          await handleSubscriptionUpdated(
            supabase,
            stripe,
            event.data.object as Stripe.Subscription,
          );
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(
            supabase,
            stripe,
            event.data.object as Stripe.Subscription,
          );
          break;
        case "charge.succeeded":
        case "charge.failed":
        case "charge.refunded":
          await handleChargeEvent(
            supabase,
            event.data.object as Stripe.Charge,
            event.type,
          );
          break;
      }

      await markSucceeded(supabase, event.id);

      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (processingError) {
      const processingErrorMessage = extractErrorMessage(processingError);
      await markFailed(supabase, event.id, processingErrorMessage);
      log.error("Event processing failed, marked for retry", {
        eventId: event.id,
        eventType: event.type,
        error: processingErrorMessage,
      });
      await notifyDiscord({
        title: "MANUS ALERT: Stripe webhook processing failed",
        message: `Event ${event.id} (${event.type}) failed: ${processingErrorMessage}`,
        severity: "error",
        context: { eventId: event.id, eventType: event.type },
      });
      return new Response(
        JSON.stringify({ error: processingErrorMessage }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Unhandled Stripe webhook error", { errorMessage });
    await notifyDiscord({
      title: "MANUS ALERT: Stripe webhook error",
      message: errorMessage,
      severity: "critical",
    });
    return new Response("Internal server error", { status: 500 });
  }
});
