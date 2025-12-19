/**
 * Discord アラート通知モジュール
 * 環境変数 DISCORD_ALERT_WEBHOOK が設定されている場合のみ通知を送信
 */

const WEBHOOK_URL = Deno.env.get("DISCORD_ALERT_WEBHOOK");

interface AlertPayload {
  title: string;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Discord に通知を送信
 * - 環境変数未設定時はスキップ
 * - タイムアウト 2.5秒
 * - 失敗時は握り潰し（本処理を止めない）
 */
export async function notifyDiscord({ title, message, context }: AlertPayload): Promise<void> {
  if (!WEBHOOK_URL) {
    console.log("[alert] DISCORD_ALERT_WEBHOOK not configured, skipping notification");
    return;
  }

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

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("[alert] Discord notification failed:", response.status);
    }
  } catch (err) {
    // 通知失敗時は握りつぶす（本処理を止めない）
    console.error("[alert] Discord notification error:", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeout);
  }
}

