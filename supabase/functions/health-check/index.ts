// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DISCORD_WEBHOOK = Deno.env.get("DISCORD_SYSTEM_WEBHOOK");
const HEALTH_WINDOW_MINUTES = Number(Deno.env.get("HEALTH_WINDOW_MINUTES") ?? "360"); // default 6h

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async () => {
  const windowStart = new Date(Date.now() - HEALTH_WINDOW_MINUTES * 60 * 1000);

  try {
    const { data, error } = await supabase
      .from("line_events")
      .select("line_user_id,risk_level,contains_phi,created_at")
      .gte("created_at", windowStart.toISOString());

    if (error) {
      throw error;
    }

    const totalEvents = data.length;
    const riskSummary = data.reduce<Record<string, number>>((acc, item) => {
      const key = item.risk_level ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const phiCount = data.filter((item) => item.contains_phi).length;

    await sendDiscordMessage(
      `🩺 **Health Check OK**\n` +
        `期間: 過去 ${HEALTH_WINDOW_MINUTES} 分\n` +
        `イベント件数: ${totalEvents}\n` +
        `リスク内訳: ${Object.entries(riskSummary)
          .map(([key, value]) => `${key}:${value}`)
          .join(", ") || "なし"}\n` +
        `PHIアラート: ${phiCount}`,
    );

    return new Response(
      JSON.stringify({ ok: true, totalEvents, riskSummary, phiCount }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    await sendDiscordMessage(
      `🚨 **Health Check Failed**\nエラー: ${
        err?.message ?? err
      }\n発生時刻: ${new Date().toISOString()}`,
    );

    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

async function sendDiscordMessage(message: string) {
  if (!DISCORD_WEBHOOK) return;

  try {
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    console.error("Failed to send health check message", err);
  }
}

