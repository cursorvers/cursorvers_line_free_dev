/**
 * 通知モジュール
 */
import { createLogger } from "../_shared/logger.ts";
import { AuditResult } from "./types.ts";

const log = createLogger("audit-notification");

type NotificationAudience = "admin" | "maintenance" | "manus";

export function buildNotificationMessage(
  result: AuditResult,
  audience: NotificationAudience,
): string {
  const isOk = result.summary.allPassed &&
    result.summary.warningCount === 0 &&
    result.summary.errorCount === 0;
  const emoji = result.summary.errorCount > 0
    ? "🚨"
    : result.summary.warningCount > 0
    ? "⚠️"
    : "✅";
  const statusText = result.summary.errorCount > 0
    ? "エラー検出"
    : result.summary.warningCount > 0
    ? "警告あり"
    : "正常";

  let message = `${emoji} **Manus監査レポート** (${result.mode})\n`;
  message += `時刻: ${new Date(result.timestamp).toLocaleString("ja-JP")}\n`;
  message += `ステータス: **${statusText}**\n\n`;

  if (!isOk || audience !== "admin") {
    message +=
      `**サマリー**: ${result.summary.warningCount}件の警告、${result.summary.errorCount}件のエラー\n\n`;
  }

  // Card inventory
  message += buildSectionMessage(
    "📊 カード在庫",
    result.checks.cardInventory,
    audience,
    isOk,
  );

  // Broadcast success
  message += buildSectionMessage(
    "📈 配信成功率",
    result.checks.broadcastSuccess,
    audience,
    isOk,
  );

  // Database health (monthly only)
  if (result.checks.databaseHealth) {
    message += buildSectionMessage(
      "🔍 データベース健全性",
      result.checks.databaseHealth,
      audience,
      isOk,
    );
  }

  // LINE registration system
  if (result.checks.lineRegistrationSystem) {
    message += buildSectionMessage(
      "🔐 LINE登録システム",
      result.checks.lineRegistrationSystem,
      audience,
      isOk,
    );
  }

  // Maintenance
  if (result.maintenance) {
    message += `**🔧 メンテナンス結果**\n`;
    message +=
      `- アーカイブ対象の配信履歴: ${result.maintenance.archivedBroadcasts}件\n`;
    message +=
      `- アーカイブしたカード: ${result.maintenance.archivedCards}件\n`;
    message += "\n";
  }

  // Remediation
  if (result.remediation?.triggered) {
    message += `**🤖 自動修繕**\n`;
    if (result.remediation.taskUrl) {
      message += `✅ Manusタスク作成済み\n`;
      message += `📎 ${result.remediation.taskUrl}\n`;
    } else if (result.remediation.error) {
      if (result.remediation.error.includes("manual intervention required")) {
        message += `⚠️ 手動対応待ち: ${result.remediation.error}\n`;
      } else {
        message += `❌ 自動修繕失敗: ${result.remediation.error}\n`;
      }
    } else {
      message += `✅ Intelligent repair を実行しました\n`;
    }
    message += "\n";
  }

  return message.trim();
}

function buildSectionMessage(
  title: string,
  check: { passed: boolean; warnings: string[] },
  audience: NotificationAudience,
  isOk: boolean,
): string {
  if (
    check.warnings.length === 0 && check.passed && audience === "admin" && isOk
  ) {
    return "";
  }

  let message = `**${title}**\n`;
  if (check.warnings.length > 0) {
    message += check.warnings.join("\n") + "\n";
  } else if (audience !== "admin") {
    message += "問題なし\n";
  }
  message += "\n";

  return message;
}

export async function sendDiscordNotification(
  result: AuditResult,
  options: {
    force?: boolean;
    webhookUrl?: string | undefined;
    audience?: NotificationAudience;
  },
): Promise<void> {
  const { force = false, webhookUrl, audience = "admin" } = options;

  if (
    !force &&
    result.summary.allPassed &&
    result.summary.warningCount === 0 &&
    result.summary.errorCount === 0
  ) {
    log.info("Audit passed, skipping Discord notification (alerts only mode)");
    return;
  }

  if (!webhookUrl) {
    log.warn("Discord webhook URL not configured, skipping notification");
    return;
  }

  const message = buildNotificationMessage(result, audience);

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    log.info("Discord notification sent", { audience });
  } catch (error) {
    log.error("Failed to send Discord notification", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function sendManusNotification(
  result: AuditResult,
  options: { force?: boolean; webhookUrl?: string | undefined },
): Promise<void> {
  const { force = false, webhookUrl } = options;

  if (
    !force &&
    result.summary.allPassed &&
    result.summary.warningCount === 0 &&
    result.summary.errorCount === 0
  ) {
    log.info("Audit passed, skipping Manus notification (alerts only mode)");
    return;
  }

  if (!webhookUrl) {
    log.warn("Manus webhook URL not configured, skipping Manus notification");
    return;
  }

  const message = buildNotificationMessage(result, "manus");

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    log.info("Manus notification sent");
  } catch (error) {
    log.error("Failed to send Manus notification", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
