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

export async function checkBroadcastSuccess(
  client: SupabaseClient,
): Promise<BroadcastCheckResult> {
  log.info("Checking broadcast success rate");

  const cutoffDate = new Date(Date.now() - DAYS_TO_CHECK * 24 * 60 * 60 * 1000)
    .toISOString();

  const { data, error } = await client
    .from("line_card_broadcasts")
    .select("sent_at, success")
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

  if (overallSuccessRate < TARGET_SUCCESS_RATE) {
    warnings.push(
      `⚠️ 警告: 過去${DAYS_TO_CHECK}日間の配信成功率が${
        overallSuccessRate.toFixed(1)
      }%です（目標: ${TARGET_SUCCESS_RATE}%以上）`,
    );
    allPassed = false;
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
    warnings.push(
      `🚨 緊急: 連続${consecutiveFailures}日間配信失敗しています！`,
    );
    allPassed = false;
  }

  log.info("Broadcast success check completed", {
    passed: allPassed,
    overallSuccessRate: overallSuccessRate.toFixed(1),
    warningCount: warnings.length,
  });

  return { passed: allPassed, warnings, details };
}
