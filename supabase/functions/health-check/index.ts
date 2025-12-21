/**
 * Health Check Edge Function
 * LINE イベントの統計情報を取得し、Discord に通知
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createLogger, errorToContext } from "../_shared/logger.ts";

const log = createLogger("health-check");

interface LineEvent {
  line_user_id: string;
  risk_level: string | null;
  contains_phi: boolean;
  created_at: string;
}

interface HealthCheckResponse {
  ok: boolean;
  totalEvents?: number;
  riskSummary?: Record<string, number>;
  phiCount?: number;
  error?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DISCORD_WEBHOOK = Deno.env.get("DISCORD_SYSTEM_WEBHOOK");
const HEALTH_WINDOW_MINUTES = Number(
  Deno.env.get("HEALTH_WINDOW_MINUTES") ?? "360",
); // default 6h

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration");
}

const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
);

async function sendDiscordMessage(message: string): Promise<void> {
  if (!DISCORD_WEBHOOK) {
    log.info("Discord webhook not configured, skipping notification");
    return;
  }

  try {
    const response = await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    if (!response.ok) {
      log.warn("Discord notification failed", { status: response.status });
    }
  } catch (err) {
    log.error("Failed to send Discord message", errorToContext(err));
  }
}

Deno.serve(async (): Promise<Response> => {
  const startTime = Date.now();
  const windowStart = new Date(Date.now() - HEALTH_WINDOW_MINUTES * 60 * 1000);

  try {
    const { data, error } = await supabase
      .from("line_events")
      .select("line_user_id,risk_level,contains_phi,created_at")
      .gte("created_at", windowStart.toISOString());

    if (error) {
      throw error;
    }

    const events = (data ?? []) as LineEvent[];
    const totalEvents = events.length;
    const riskSummary = events.reduce<Record<string, number>>((acc, item) => {
      const key = item.risk_level ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const phiCount = events.filter((item) => item.contains_phi).length;

    log.info("Health check completed", {
      totalEvents,
      riskSummary,
      phiCount,
      windowMinutes: HEALTH_WINDOW_MINUTES,
      durationMs: Date.now() - startTime,
    });

    await sendDiscordMessage(
      `🩺 **Health Check OK**\n` +
        `期間: 過去 ${HEALTH_WINDOW_MINUTES} 分\n` +
        `イベント件数: ${totalEvents}\n` +
        `リスク内訳: ${
          Object.entries(riskSummary)
            .map(([key, value]) => `${key}:${value}`)
            .join(", ") || "なし"
        }\n` +
        `PHIアラート: ${phiCount}`,
    );

    const response: HealthCheckResponse = {
      ok: true,
      totalEvents,
      riskSummary,
      phiCount,
    };
    return new Response(
      JSON.stringify(response),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    log.error("Health check failed", {
      ...errorToContext(err),
      durationMs: Date.now() - startTime,
    });

    const errorMessage = err instanceof Error ? err.message : String(err);
    await sendDiscordMessage(
      `🚨 **Health Check Failed**\nエラー: ${errorMessage}\n発生時刻: ${
        new Date().toISOString()
      }`,
    );

    const response: HealthCheckResponse = { ok: false, error: errorMessage };
    return new Response(
      JSON.stringify(response),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
