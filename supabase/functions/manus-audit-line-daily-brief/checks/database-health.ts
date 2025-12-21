/**
 * データベース健全性チェック
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "../../_shared/logger.ts";
import { DatabaseHealthCheckResult } from "../types.ts";

const log = createLogger("audit-database-health");

const HIGH_USAGE_THRESHOLD = 100;
const ABNORMAL_USAGE_THRESHOLD = 200;

export async function checkDatabaseHealth(
  client: SupabaseClient,
): Promise<DatabaseHealthCheckResult> {
  log.info("Checking database health");

  const warnings: string[] = [];
  let duplicates = 0;
  const anomalies: string[] = [];

  // Check for duplicate content hashes
  let hashData: number | null = null;
  let hashError = false;

  try {
    const rpcResult = await client.rpc("check_duplicate_hashes");
    if (rpcResult.error) {
      hashError = true;
    } else {
      hashData = rpcResult.data as number;
    }
  } catch (_err) {
    // If RPC function doesn't exist, use alternative query
    const { data: cards, error: cardsError } = await client
      .from("line_cards")
      .select("content_hash");

    if (cardsError) {
      hashError = true;
    } else {
      const hashCounts: Record<string, number> = {};
      for (const card of cards || []) {
        if (card.content_hash) {
          hashCounts[card.content_hash] = (hashCounts[card.content_hash] || 0) +
            1;
        }
      }
      hashData = Object.values(hashCounts).filter((count) => count > 1).length;
    }
  }

  if (!hashError && typeof hashData === "number") {
    duplicates = hashData;
  } else if (hashData && Array.isArray(hashData)) {
    duplicates = hashData.length;
  }

  if (duplicates > 0) {
    warnings.push(
      `⚠️ 警告: 重複コンテンツハッシュが${duplicates}件検出されました`,
    );
  }

  // Check for cards with abnormally high times_used
  const { data: highUsage, error: usageError } = await client
    .from("line_cards")
    .select("id, theme, times_used")
    .gt("times_used", HIGH_USAGE_THRESHOLD)
    .order("times_used", { ascending: false })
    .limit(10);

  if (!usageError && highUsage && highUsage.length > 0) {
    const maxUsage = highUsage[0].times_used;
    if (maxUsage > ABNORMAL_USAGE_THRESHOLD) {
      anomalies.push(
        `異常に多い使用回数: ${maxUsage}回（カードID: ${highUsage[0].id}）`,
      );
      warnings.push(
        `⚠️ 警告: 使用回数が異常に多いカードが検出されました（最大: ${maxUsage}回）`,
      );
    }
  }

  const passed = warnings.length === 0;
  log.info("Database health check completed", {
    passed,
    warningCount: warnings.length,
  });

  return { passed, warnings, duplicates, anomalies };
}
