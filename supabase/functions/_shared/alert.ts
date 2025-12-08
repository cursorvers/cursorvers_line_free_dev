// @ts-nocheck
/// <reference types="https://deno.land/std@0.168.0/types.d.ts" />
const WEBHOOK_URL =
  Deno.env.get("DISCORD_ALERT_WEBHOOK") ??
  "https://discord.com/api/webhooks/1443439317283373188/ugh_DFZig51DqDuAmzn5N__0edLAHvgjfMbRAxZrK2NPIU4lsBviKjB-2eQCYe1eLutb";

type AlertPayload = {
  title: string;
  message: string;
  context?: Record<string, unknown>;
};

export async function notifyDiscord({ title, message, context }: AlertPayload) {
  if (!WEBHOOK_URL) return;

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

    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    });
  } catch (_err) {
    // 通知失敗時は握りつぶす（本処理を止めない）
  } finally {
    clearTimeout(timeout);
  }
}

