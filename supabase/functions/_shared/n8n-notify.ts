/**
 * Discord イベント通知モジュール
 * discord-relay 経由でチャンネル別にルーティング
 */

import { createLogger } from "./logger.ts";
import { extractErrorMessage } from "./error-utils.ts";

const log = createLogger("discord-event-notify");

// discord-relay エンドポイント（チャンネル別ルーティング）
const DISCORD_RELAY_BASE =
  "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/discord-relay";

// タイムアウト設定
const NOTIFICATION_TIMEOUT_MS = 5000;

interface NotifyResult {
  success: boolean;
  error?: string;
}

/**
 * discord-relay 経由で埋め込みメッセージを送信
 */
async function sendToRelay(
  endpoint: string,
  embeds: unknown[],
): Promise<NotifyResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      NOTIFICATION_TIMEOUT_MS,
    );

    const response = await fetch(`${DISCORD_RELAY_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.text();
      log.warn("Discord relay failed", { status: response.status, errorData });
      return { success: false, error: `HTTP ${response.status}` };
    }

    log.info("Discord notification sent via relay", { endpoint });
    return { success: true };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.warn("Discord relay error", { errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Stripe決済イベントをDiscordに通知 → #system-monitor
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

  const embed = {
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
    timestamp: new Date().toISOString(),
  };

  return sendToRelay("/line-event", [embed]);
}

/**
 * LINE登録イベントをDiscordに通知 → #system-monitor
 */
export function notifyLineEvent(
  eventType: string,
  lineUserId: string,
  displayName?: string,
  pictureUrl?: string,
  options?: {
    totalMembers?: number;
    email?: string;
  },
): Promise<NotifyResult> {
  const embed: {
    title: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    thumbnail?: { url: string };
    footer?: { text: string };
    timestamp: string;
  } = {
    title: "👋 LINE 新規登録",
    color: 0x00FF00, // 緑
    fields: [
      { name: "👤 表示名", value: displayName ?? "未取得", inline: true },
      {
        name: "📱 LINE ID",
        value: lineUserId.slice(0, 8) + "...",
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  // メールアドレスがあれば追加
  if (options?.email) {
    embed.fields.push({
      name: "📧 メール",
      value: options.email,
      inline: true,
    });
  }

  // 累計登録者数があれば追加
  if (options?.totalMembers !== undefined) {
    embed.fields.push({
      name: "📊 累計登録者数",
      value: `${options.totalMembers} 人`,
      inline: true,
    });
  }

  if (pictureUrl) {
    embed.thumbnail = { url: pictureUrl };
  }

  return sendToRelay("/line-event", [embed]);
}
