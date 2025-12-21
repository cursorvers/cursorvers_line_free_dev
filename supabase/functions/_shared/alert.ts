/**
 * Discord アラート通知モジュール
 * 環境変数 DISCORD_ALERT_WEBHOOK が設定されている場合のみ通知を送信
 *
 * 機能:
 * - 指数バックオフ付きリトライ（最大3回）
 * - 配信確認（HTTPステータスチェック）
 * - タイムアウト処理（5秒）
 */

import { createLogger } from "./logger.ts";
import { withRetry, isRetryableStatus } from "./retry.ts";

const log = createLogger("alert");
const WEBHOOK_URL = Deno.env.get("DISCORD_ALERT_WEBHOOK");

// 通知設定
const NOTIFICATION_TIMEOUT_MS = 5000;  // 5秒
const MAX_RETRIES = 2;  // 最大2回リトライ（計3回試行）

interface AlertPayload {
  title: string;
  message: string;
  context?: Record<string, unknown>;
  /** 重要度: critical > warning > info */
  severity?: "critical" | "warning" | "info";
}

interface NotifyResult {
  success: boolean;
  attempts: number;
  error?: string;
}

/**
 * Discord に通知を送信（リトライ付き）
 * - 環境変数未設定時はスキップ
 * - タイムアウト 5秒
 * - 最大3回試行（指数バックオフ）
 * - 失敗時は握り潰し（本処理を止めない）
 *
 * @returns 送信結果（成功/失敗、試行回数）
 */
export async function notifyDiscord(payload: AlertPayload): Promise<NotifyResult> {
  const { title, message, context, severity = "info" } = payload;

  if (!WEBHOOK_URL) {
    log.debug("DISCORD_ALERT_WEBHOOK not configured, skipping notification");
    return { success: false, attempts: 0, error: "Webhook not configured" };
  }

  let attempts = 0;

  try {
    await withRetry(
      async () => {
        attempts++;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);

        try {
          // 重要度に応じた絵文字
          const severityEmoji = {
            critical: "🚨",
            warning: "⚠️",
            info: "ℹ️",
          }[severity];

          const content = [
            `${severityEmoji} **${title}**`,
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

          // 配信確認
          if (!response.ok) {
            const errorText = await response.text().catch(() => "Unknown error");

            if (isRetryableStatus(response.status)) {
              // リトライ可能なエラー
              throw new Error(`Discord webhook failed: ${response.status} - ${errorText}`);
            }

            // リトライ不可能なエラー（4xx等）
            log.error("Discord notification failed (non-retryable)", {
              status: response.status,
              error: errorText,
              title,
            });
            throw new Error(`NON_RETRYABLE:${response.status}:${errorText}`);
          }

          // 成功時のログ
          log.info("Discord notification sent", {
            title,
            severity,
            attempts,
          });

        } finally {
          clearTimeout(timeout);
        }
      },
      {
        maxRetries: MAX_RETRIES,
        initialDelay: 500,  // 最初のリトライは500ms後
        maxDelay: 2000,     // 最大2秒
        shouldRetry: (error) => {
          if (error instanceof Error && error.message.startsWith("NON_RETRYABLE:")) {
            return false;
          }
          return true;
        },
        onRetry: (attempt, error, nextDelay) => {
          log.warn("Discord notification failed, retrying", {
            attempt,
            error: error instanceof Error ? error.message : String(error),
            nextDelayMs: nextDelay,
            title,
          });
        },
      }
    );

    return { success: true, attempts };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const cleanedMessage = errorMessage.replace(/^NON_RETRYABLE:/, "");

    log.error("Discord notification failed after retries", {
      error: cleanedMessage,
      attempts,
      title,
    });

    // 通知失敗でも本処理は止めない
    return { success: false, attempts, error: cleanedMessage };
  }
}

/**
 * 緊急アラートを送信（リトライ付き）
 */
export function notifyCritical(title: string, message: string, context?: Record<string, unknown>): Promise<NotifyResult> {
  return notifyDiscord({ title, message, context, severity: "critical" });
}

/**
 * 警告アラートを送信（リトライ付き）
 */
export function notifyWarning(title: string, message: string, context?: Record<string, unknown>): Promise<NotifyResult> {
  return notifyDiscord({ title, message, context, severity: "warning" });
}

/**
 * 情報アラートを送信（リトライ付き）
 */
export function notifyInfo(title: string, message: string, context?: Record<string, unknown>): Promise<NotifyResult> {
  return notifyDiscord({ title, message, context, severity: "info" });
}
