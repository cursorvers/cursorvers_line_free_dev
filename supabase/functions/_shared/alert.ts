// @ts-nocheck
/// <reference types="https://deno.land/std@0.168.0/types.d.ts" />
// Send anomalies to MANUS if configured; fallback to Discord
const MANUS_WEBHOOK_URL = Deno.env.get("MANUS_WEBHOOK_URL");
const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_ALERT_WEBHOOK");

type AlertPayload = {
  title: string;
  message: string;
  context?: Record<string, unknown>;
};

export async function notifyDiscord({ title, message, context }: AlertPayload) {
  const targets = [MANUS_WEBHOOK_URL, DISCORD_WEBHOOK_URL].filter(Boolean);
  if (targets.length === 0) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const content = [
      `**${title}**`,
      message,
      context ? "```json\n" + JSON.stringify(context, null, 2) + "\n```" : "",
    ]
      .filter(Boolean)
      .join("\n");

    for (const url of targets) {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });
    }
  } catch (_err) {
    // 通知失敗時は握りつぶす（本処理を止めない）
  } finally {
    clearTimeout(timeout);
  }
}

