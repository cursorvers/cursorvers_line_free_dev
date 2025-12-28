/**
 * LINE Messaging API 共有モジュール
 * 全 Edge Functions から LINE プッシュメッセージを送信
 */
import { createLogger } from "./logger.ts";
import { extractErrorMessage } from "./error-utils.ts";

const log = createLogger("line-messaging");

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ??
  "";

/**
 * LINE ユーザーにテキストメッセージをプッシュ送信
 */
export async function pushLineMessage(
  lineUserId: string,
  message: string,
): Promise<boolean> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    log.warn("LINE_CHANNEL_ACCESS_TOKEN not configured");
    return false;
  }

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text: message }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error("LINE push failed", { status: response.status, errorText });
      return false;
    }

    log.info("LINE push sent", { userId: lineUserId.slice(0, 8) + "..." });
    return true;
  } catch (err) {
    log.error("LINE push error", {
      errorMessage: extractErrorMessage(err),
    });
    return false;
  }
}
