/**
 * 配信成功率チェック
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "../../_shared/logger.ts";
import { BroadcastCheckResult, BroadcastStats } from "../types.ts";

const log = createLogger("audit-broadcast-success");

const DAYS_TO_CHECK = 7;
const TARGET_SUCCESS_RATE = 90;
const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const MIN_SAMPLE_SIZE = 5;
const QUOTA_WARNING_PERCENT = 90;

interface QuotaInfo {
  type: "limited" | "none" | "unknown";
  limit: number | null;
  consumption: number | null;
  percentUsed: number | null;
}

function getLineChannelAccessToken(): string {
  return Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ??
    Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN_V2") ??
    "";
}

async function fetchQuotaInfo(): Promise<QuotaInfo | null> {
  const accessToken = getLineChannelAccessToken();
  if (!accessToken) {
    return null;
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  try {
    const [quotaResponse, consumptionResponse] = await Promise.all([
      fetch("https://api.line.me/v2/bot/message/quota", { headers }),
      fetch("https://api.line.me/v2/bot/message/quota/consumption", {
        headers,
      }),
    ]);

    if (!quotaResponse.ok || !consumptionResponse.ok) {
      log.warn("Failed to fetch LINE quota metadata", {
        quotaStatus: quotaResponse.status,
        consumptionStatus: consumptionResponse.status,
      });
      return null;
    }

    const quotaJson = await quotaResponse.json();
    const consumptionJson = await consumptionResponse.json();

    const type = quotaJson?.type === "none" || quotaJson?.type === "limited"
      ? quotaJson.type as "none" | "limited"
      : "unknown";
    const limit = typeof quotaJson?.value === "number" ? quotaJson.value : null;
    const consumption = typeof consumptionJson?.totalUsage === "number"
      ? consumptionJson.totalUsage
      : null;

    const percentUsed = type === "limited" && limit && consumption !== null
      ? (consumption / limit) * 100
      : null;

    return {
      type,
      limit,
      consumption,
      percentUsed,
    };
  } catch (error) {
    log.warn("LINE quota lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function checkBroadcastSuccess(
  client: SupabaseClient,
): Promise<BroadcastCheckResult> {
  log.info("Checking broadcast success rate");

  const cutoffDate = new Date(Date.now() - DAYS_TO_CHECK * 24 * 60 * 60 * 1000)
    .toISOString();

  const { data, error } = await client
    .from("line_card_broadcasts")
    .select("sent_at, success, error_message, line_response_status")
    .gte("sent_at", cutoffDate)
    .order("sent_at", { ascending: false });

  if (error) {
    log.error("Failed to fetch broadcast history", { error: error.message });
    return {
      passed: false,
      warnings: [`Failed to fetch history: ${error.message}`],
      details: [],
    };
  }

  const quotaInfo = await fetchQuotaInfo();

  // Aggregate by date
  const dailyStats: Record<
    string,
    { total: number; successful: number; failed: number }
  > = {};

  for (const record of data || []) {
    const date = new Date(record.sent_at).toISOString().split("T")[0] ?? "";
    if (!dailyStats[date]) {
      dailyStats[date] = { total: 0, successful: 0, failed: 0 };
    }
    dailyStats[date].total++;
    if (record.success) {
      dailyStats[date].successful++;
    } else {
      dailyStats[date].failed++;
    }
  }

  const details: BroadcastStats[] = Object.entries(dailyStats)
    .map(([date, stats]) => ({
      date,
      total: stats.total,
      successful: stats.successful,
      failed: stats.failed,
      success_rate: stats.total > 0
        ? (stats.successful / stats.total) * 100
        : 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const warnings: string[] = [];
  let allPassed = true;

  // Check overall success rate
  const totalSuccessful = details.reduce((sum, d) => sum + d.successful, 0);
  const totalBroadcasts = details.reduce((sum, d) => sum + d.total, 0);
  const overallSuccessRate = totalBroadcasts > 0
    ? (totalSuccessful / totalBroadcasts) * 100
    : 100;

  const insufficientSample = totalBroadcasts > 0 &&
    totalBroadcasts < MIN_SAMPLE_SIZE;
  const quotaSignals = (data || []).filter((record) => {
    const errorMessage = String(record.error_message ?? "");
    return record.line_response_status === 429 ||
      /monthly limit|quota|上限|Too Many Requests/i.test(errorMessage);
  }).length;
  const quotaNearLimit = quotaInfo?.type === "limited" &&
    (quotaInfo.percentUsed ?? 0) >= QUOTA_WARNING_PERCENT;
  const quotaExhausted = quotaInfo?.type === "limited" &&
    quotaInfo.limit !== null &&
    quotaInfo.consumption !== null &&
    quotaInfo.consumption >= quotaInfo.limit;

  if (quotaInfo?.type === "limited" && quotaInfo.percentUsed !== null) {
    const usageMessage = `ℹ️ LINE月間通数使用率: ${
      quotaInfo.percentUsed.toFixed(1)
    }% (${quotaInfo.consumption}/${quotaInfo.limit})`;

    if (quotaInfo.percentUsed >= QUOTA_WARNING_PERCENT) {
      warnings.push(
        `${usageMessage}。無料/上限付きプランの制約を考慮してください。`,
      );
    } else {
      log.info("LINE quota within expected range", {
        percentUsed: quotaInfo.percentUsed.toFixed(1),
        consumption: quotaInfo.consumption,
        limit: quotaInfo.limit,
      });
    }
  }

  if (overallSuccessRate < TARGET_SUCCESS_RATE) {
    if (insufficientSample) {
      warnings.push(
        `ℹ️ 参考: 過去${DAYS_TO_CHECK}日間の配信成功率は${
          overallSuccessRate.toFixed(1)
        }%ですが、試行件数が${totalBroadcasts}件のため監査エラーにはしません`,
      );
    } else if (quotaNearLimit || quotaExhausted || quotaSignals > 0) {
      warnings.push(
        `ℹ️ 参考: 過去${DAYS_TO_CHECK}日間の配信成功率は${
          overallSuccessRate.toFixed(1)
        }%です。月間通数上限の影響が疑われるため、システム障害とはみなしません`,
      );
    } else {
      warnings.push(
        `⚠️ 警告: 過去${DAYS_TO_CHECK}日間の配信成功率が${
          overallSuccessRate.toFixed(1)
        }%です（目標: ${TARGET_SUCCESS_RATE}%以上）`,
      );
      allPassed = false;
    }
  }

  // Check consecutive failures
  let consecutiveFailures = 0;
  for (const day of details.slice(0, CONSECUTIVE_FAILURE_THRESHOLD)) {
    if (day.failed > 0 && day.successful === 0) {
      consecutiveFailures++;
    } else {
      break;
    }
  }
  if (consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
    if (quotaNearLimit || quotaExhausted || quotaSignals > 0) {
      warnings.push(
        `ℹ️ 連続${consecutiveFailures}日間の配信失敗がありますが、月間通数上限の影響が疑われます`,
      );
    } else {
      warnings.push(
        `🚨 緊急: 連続${consecutiveFailures}日間配信失敗しています！`,
      );
      allPassed = false;
    }
  }

  log.info("Broadcast success check completed", {
    passed: allPassed,
    overallSuccessRate: overallSuccessRate.toFixed(1),
    warningCount: warnings.length,
    totalBroadcasts,
    insufficientSample,
    quotaPercentUsed: quotaInfo?.percentUsed?.toFixed(1),
  });

  return { passed: allPassed, warnings, details };
}
