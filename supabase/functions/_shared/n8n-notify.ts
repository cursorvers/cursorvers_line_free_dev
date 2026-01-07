/**
 * Discord イベント通知モジュール
 * Edge Functionから直接Discordに通知を送信
 */

import { createLogger } from "./logger.ts";
import { extractErrorMessage } from "./error-utils.ts";

const log = createLogger("discord-event-notify");

// Discord Webhook URL（M-ISAC用と共通）
const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_ALERT_WEBHOOK") ??
  "https://discord.com/api/webhooks/1457311304162476115/XXvNOy7xuLNAdWcGJ4LHTggVFyy7vdg24f9eMK6pEV8XI-A5dYZBFFK791ib_9OmtqY0";

// タイムアウト設定
const NOTIFICATION_TIMEOUT_MS = 5000;

interface NotifyResult {
  success: boolean;
  error?: string;
}

/**
 * Discordに埋め込みメッセージを送信
 */
async function sendDiscordEmbed(
  username: string,
  embed: {
    title: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    thumbnail?: { url: string };
    timestamp?: string;
  },
): Promise<NotifyResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      NOTIFICATION_TIMEOUT_MS,
    );

    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        embeds: [{ ...embed, timestamp: embed.timestamp ?? new Date().toISOString() }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.warn("Discord notification failed", { status: response.status });
      return { success: false, error: `HTTP ${response.status}` };
    }

    log.info("Discord notification sent", { username, title: embed.title });
    return { success: true };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.warn("Discord notification error", { errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Stripe決済イベントをDiscordに通知
 */
export function notifyStripeEvent(
  _eventType: string,
  email: string | null,
  name: string | null,
  amount: number | null,
  currency: string,
  mode: string,
  _sessionId?: string,
): Promise<NotifyResult> {
  const formattedAmount = amount
    ? (amount / 100).toLocaleString("ja-JP")
    : "N/A";

  return sendDiscordEmbed("Stripe Bot", {
    title: "💰 新規決済完了",
    color: 0x58D68D, // 緑
    fields: [
      { name: "📧 メール", value: email ?? "N/A", inline: true },
      { name: "👤 名前", value: name ?? "N/A", inline: true },
      {
        name: "💴 金額",
        value: `${formattedAmount} ${currency.toUpperCase()}`,
        inline: true,
      },
      { name: "📋 タイプ", value: mode, inline: true },
    ],
  });
}

/**
 * LINE登録イベントをDiscordに通知
 */
export function notifyLineEvent(
  eventType: string,
  lineUserId: string,
  displayName?: string,
  pictureUrl?: string,
): Promise<NotifyResult> {
  const embed: {
    title: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    thumbnail?: { url: string };
  } = {
    title: "👋 LINE 新規登録",
    color: 0x00FF00, // 緑
    fields: [
      { name: "👤 表示名", value: displayName ?? "N/A", inline: true },
      {
        name: "📱 LINE ID",
        value: lineUserId.slice(0, 8) + "...",
        inline: true,
      },
      { name: "🎯 イベント", value: eventType, inline: true },
    ],
  };

  if (pictureUrl) {
    embed.thumbnail = { url: pictureUrl };
  }

  return sendDiscordEmbed("LINE Bot", embed);
}
