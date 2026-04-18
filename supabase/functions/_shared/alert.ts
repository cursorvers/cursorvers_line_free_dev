/**
 * Discord通知ユーティリティ
 * システムアラートをDiscordに送信
 */

// 環境変数は実行時に読み込む（テスト対応）
function getDiscordWebhook(): string | undefined {
  return Deno.env.get("DISCORD_SYSTEM_WEBHOOK");
}

export interface NotifyOptions {
  title: string;
  message: string;
  context?: Record<string, unknown> | undefined;
  severity?: "info" | "warning" | "error" | "critical";
}

export interface NotifyResult {
  success: boolean;
  attempts: number;
  error?: string | undefined;
}

/**
 * Discordにアラートメッセージを送信
 */
export async function notifyDiscord(
  options: NotifyOptions,
): Promise<NotifyResult> {
  const webhook = getDiscordWebhook();
  if (!webhook) {
    return { success: false, attempts: 0, error: "Webhook not configured" };
  }

  const { title, message, context, severity = "info" } = options;

  // severity に応じた絵文字
  const severityEmoji: Record<string, string> = {
    critical: "🚨",
    warning: "⚠️",
    info: "ℹ️",
    error: "❌",
  };

  const emoji = severityEmoji[severity] ?? "ℹ️";
  let content = `${emoji} **${title}**\n${message}`;

  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");
    content += `\n\`\`\`\n${contextStr}\n\`\`\``;
  }

  content += `\n_${new Date().toISOString()}_`;

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    // レスポンスボディを消費（リソースリーク防止）
    await response.text();

    if (!response.ok) {
      return {
        success: false,
        attempts: 1,
        error: `Discord notification failed: ${response.status}`,
      };
    }

    return { success: true, attempts: 1 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, attempts: 1, error: errorMessage };
  }
}

/**
 * Critical レベルの通知
 */
export function notifyCritical(
  title: string,
  message: string,
  context?: Record<string, unknown>,
): Promise<NotifyResult> {
  return notifyDiscord({ title, message, context, severity: "critical" });
}

/**
 * Warning レベルの通知
 */
export function notifyWarning(
  title: string,
  message: string,
  context?: Record<string, unknown>,
): Promise<NotifyResult> {
  return notifyDiscord({ title, message, context, severity: "warning" });
}

/**
 * Info レベルの通知
 */
export function notifyInfo(
  title: string,
  message: string,
  context?: Record<string, unknown>,
): Promise<NotifyResult> {
  return notifyDiscord({ title, message, context, severity: "info" });
}
