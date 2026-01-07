/**
 * Discord通知ユーティリティ
 * システムアラートをDiscordに送信
 */

const DISCORD_WEBHOOK = Deno.env.get("DISCORD_SYSTEM_WEBHOOK");

interface NotifyOptions {
  title: string;
  message: string;
  context?: Record<string, unknown>;
  severity?: "info" | "warning" | "error" | "critical";
}

/**
 * Discordにアラートメッセージを送信
 */
export async function notifyDiscord(options: NotifyOptions): Promise<void> {
  if (!DISCORD_WEBHOOK) {
    console.warn("DISCORD_SYSTEM_WEBHOOK not configured, skipping notification");
    return;
  }

  const { title, message, context } = options;

  let content = `**${title}**\n${message}`;

  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");
    content += `\n\`\`\`\n${contextStr}\n\`\`\``;
  }

  content += `\n_${new Date().toISOString()}_`;

  try {
    const response = await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      console.error(`Discord notification failed: ${response.status}`);
    }
  } catch (error) {
    console.error("Failed to send Discord notification:", error);
  }
}
