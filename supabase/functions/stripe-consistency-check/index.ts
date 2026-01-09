import { createClient } from "@supabase/supabase-js";
import { notifyDiscord } from "../_shared/alert.ts";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { createLogger, errorToContext } from "../_shared/logger.ts";

const log = createLogger("stripe-consistency-check");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const rawWindowHours = Number(
  Deno.env.get("STRIPE_RECON_WINDOW_HOURS") ?? "24",
);
const WINDOW_HOURS = Number.isFinite(rawWindowHours) && rawWindowHours > 0
  ? rawWindowHours
  : 24;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async () => {
  const startTime = Date.now();
  const windowStart = new Date(
    Date.now() - WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  try {
    const { count: eventCount, error: eventError } = await supabase
      .from("stripe_events_processed")
      .select("event_id", { count: "exact", head: true })
      .eq("event_type", "checkout.session.completed")
      .gte("processed_at", windowStart);

    if (eventError) {
      throw eventError;
    }

    const { count: memberCount, error: memberError } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .gte("updated_at", windowStart)
      .not("stripe_customer_id", "is", null);

    if (memberError) {
      throw memberError;
    }

    const normalizedEventCount = eventCount ?? 0;
    const normalizedMemberCount = memberCount ?? 0;
    const diff = normalizedEventCount - normalizedMemberCount;
    const ok = diff === 0;

    log.info("Stripe consistency check completed", {
      windowHours: WINDOW_HOURS,
      eventCount: normalizedEventCount,
      memberCount: normalizedMemberCount,
      diff,
      durationMs: Date.now() - startTime,
    });

    if (!ok) {
      await notifyDiscord({
        title: "MANUS ALERT: Stripe consistency mismatch",
        message:
          `Window: ${WINDOW_HOURS}h | Events: ${normalizedEventCount} | Members: ${normalizedMemberCount} | Diff: ${diff}`,
        severity: "warning",
        context: {
          windowStart,
          eventCount: normalizedEventCount,
          memberCount: normalizedMemberCount,
          diff,
        },
      });
    }

    return new Response(
      JSON.stringify({
        ok,
        windowHours: WINDOW_HOURS,
        windowStart,
        eventCount: normalizedEventCount,
        memberCount: normalizedMemberCount,
        diff,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Stripe consistency check failed", {
      ...errorToContext(err),
      durationMs: Date.now() - startTime,
    });
    await notifyDiscord({
      title: "MANUS ALERT: Stripe consistency check failed",
      message: errorMessage,
      severity: "critical",
    });

    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
