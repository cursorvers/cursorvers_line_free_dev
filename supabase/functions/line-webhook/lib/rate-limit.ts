/**
 * レート制限モジュール
 */
import { supabase } from "../../_shared/supabase.ts";
import { createLogger, anonymizeUserId } from "../../_shared/logger.ts";

const log = createLogger("rate-limit");

const MAX_POLISH_PER_HOUR = Number(Deno.env.get("MAX_POLISH_PER_HOUR") ?? "10");

export { MAX_POLISH_PER_HOUR };

/** 利用回数チェック結果 */
export interface UsageCountResult {
  count: number;
  nextAvailable: Date | null;
}

/**
 * 直近1時間の利用回数をチェック（汎用）
 */
export async function getHourlyUsageCount(
  userId: string,
  interactionType: string
): Promise<UsageCountResult> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneHourAgoIso = oneHourAgo.toISOString();

  const { data, error } = await supabase
    .from("interaction_logs")
    .select("created_at")
    .eq("user_id", userId)
    .eq("interaction_type", interactionType)
    .gte("created_at", oneHourAgoIso)
    .order("created_at", { ascending: true });

  if (error) {
    log.error("getHourlyUsageCount failed", {
      userId: anonymizeUserId(userId),
      interactionType,
      errorMessage: error.message
    });
    return { count: 0, nextAvailable: null };
  }

  const count = data?.length ?? 0;

  // 上限以上使っている場合、最初の利用から1時間後を計算
  let nextAvailable: Date | null = null;
  if (count >= MAX_POLISH_PER_HOUR && data && data.length > 0) {
    const oldestUsage = new Date(data[0].created_at);
    nextAvailable = new Date(oldestUsage.getTime() + 60 * 60 * 1000);
  }

  return { count, nextAvailable };
}

/**
 * Prompt Polisher 用
 */
export function getHourlyPolishCount(userId: string): Promise<UsageCountResult> {
  return getHourlyUsageCount(userId, "prompt_polisher");
}

/**
 * Risk Checker 用
 */
export function getHourlyRiskCheckCount(userId: string): Promise<UsageCountResult> {
  return getHourlyUsageCount(userId, "risk_checker");
}
