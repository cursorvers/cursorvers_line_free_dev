/**
 * Manus Audit for LINE Daily Brief
 *
 * Performs weekly audits and monthly maintenance for the LINE Daily Brief system.
 * 
 * Audit checks:
 * - Card inventory (weekly): Warn if any theme has < 50 ready cards
 * - Broadcast success rate (weekly): Warn if success rate < 90% in last 7 days
 * - Database health (monthly): Detect duplicates, anomalies
 * 
 * Maintenance tasks (monthly):
 * - Archive old broadcast history (> 90 days)
 * - Archive unused cards (> 1 year unused)
 *
 * POST /manus-audit-line-daily-brief
 * Headers:
 *   - X-API-Key: API key for scheduler authentication (MANUS_AUDIT_API_KEY)
 *   - OR Authorization: Bearer <service_role_key>
 * 
 * Query params:
 *   - mode=daily: Daily audit (card inventory + broadcast success)
 *   - mode=weekly: Weekly audit (same as daily)
 *   - mode=monthly: Monthly audit + maintenance
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

type CardTheme = "ai_gov" | "tax" | "law" | "biz" | "career" | "asset" | "general";
type AuditMode = "daily" | "weekly" | "monthly";

interface CardInventory {
  theme: CardTheme;
  ready_cards: number;
  used_cards: number;
  total_cards: number;
}

interface BroadcastStats {
  date: string;
  total: number;
  successful: number;
  failed: number;
  success_rate: number;
}

interface AuditResult {
  timestamp: string;
  mode: AuditMode;
  checks: {
    cardInventory: {
      passed: boolean;
      warnings: string[];
      details: CardInventory[];
    };
    broadcastSuccess: {
      passed: boolean;
      warnings: string[];
      details: BroadcastStats[];
    };
    databaseHealth?: {
      passed: boolean;
      warnings: string[];
      duplicates?: number;
      anomalies?: string[];
    };
  };
  maintenance?: {
    archivedBroadcasts: number;
    archivedCards: number;
  };
  summary: {
    allPassed: boolean;
    warningCount: number;
    errorCount: number;
  };
}

const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const getEnv = (name: (typeof REQUIRED_ENV_VARS)[number]): string => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const SUPABASE_URL = getEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const MANUS_AUDIT_API_KEY = Deno.env.get("MANUS_AUDIT_API_KEY");
const DISCORD_ADMIN_WEBHOOK_URL = Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL");

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function log(level: "info" | "warn" | "error", message: string, data?: unknown): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data && { data }),
  };
  console.log(JSON.stringify(logEntry));
}

function verifyAuth(req: Request): boolean {
  // Method 1: X-API-Key header
  const apiKeyHeader = req.headers.get("X-API-Key");
  if (MANUS_AUDIT_API_KEY && apiKeyHeader === MANUS_AUDIT_API_KEY) {
    log("info", "Authentication successful via X-API-Key");
    return true;
  }

  // Method 2: Authorization Bearer (service role key) - fallback
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      log("info", "Authentication successful via Bearer token");
      return true;
    }
  }

  log("warn", "Authentication failed", {
    hasApiKey: !!MANUS_AUDIT_API_KEY,
    hasApiKeyHeader: !!apiKeyHeader,
  });
  return false;
}

async function checkCardInventory(client: SupabaseClient): Promise<{
  passed: boolean;
  warnings: string[];
  details: CardInventory[];
}> {
  log("info", "Checking card inventory");

  const { data, error } = await client
    .from("line_cards")
    .select("theme, status")
    .in("status", ["ready", "used", "archived"]);

  if (error) {
    log("error", "Failed to fetch card inventory", { error: error.message });
    return { passed: false, warnings: [`Failed to fetch inventory: ${error.message}`], details: [] };
  }

  // Aggregate by theme
  const inventory: Record<CardTheme, { ready: number; used: number; archived: number; total: number }> = {
    ai_gov: { ready: 0, used: 0, archived: 0, total: 0 },
    tax: { ready: 0, used: 0, archived: 0, total: 0 },
    law: { ready: 0, used: 0, archived: 0, total: 0 },
    biz: { ready: 0, used: 0, archived: 0, total: 0 },
    career: { ready: 0, used: 0, archived: 0, total: 0 },
    asset: { ready: 0, used: 0, archived: 0, total: 0 },
    general: { ready: 0, used: 0, archived: 0, total: 0 },
  };

  for (const card of data || []) {
    const theme = card.theme as CardTheme;
    if (inventory[theme]) {
      inventory[theme].total++;
      if (card.status === "ready") inventory[theme].ready++;
      else if (card.status === "used") inventory[theme].used++;
      else if (card.status === "archived") inventory[theme].archived++;
    }
  }

  const details: CardInventory[] = Object.entries(inventory).map(([theme, stats]) => ({
    theme: theme as CardTheme,
    ready_cards: stats.ready,
    used_cards: stats.used,
    total_cards: stats.total,
  }));

  const warnings: string[] = [];
  let allPassed = true;

  for (const item of details) {
    if (item.ready_cards === 0) {
      warnings.push(`🚨 緊急: ${item.theme}テーマのreadyカードが0枚です！`);
      allPassed = false;
    } else if (item.ready_cards < 50) {
      warnings.push(`⚠️ 警告: ${item.theme}テーマのreadyカードが${item.ready_cards}枚（50枚未満）`);
      allPassed = false;
    }
  }

  log("info", "Card inventory check completed", { passed: allPassed, warningCount: warnings.length });

  return { passed: allPassed, warnings, details };
}

async function checkBroadcastSuccess(client: SupabaseClient): Promise<{
  passed: boolean;
  warnings: string[];
  details: BroadcastStats[];
}> {
  log("info", "Checking broadcast success rate");

  const { data, error } = await client
    .from("line_card_broadcasts")
    .select("sent_at, success")
    .gte("sent_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("sent_at", { ascending: false });

  if (error) {
    log("error", "Failed to fetch broadcast history", { error: error.message });
    return { passed: false, warnings: [`Failed to fetch history: ${error.message}`], details: [] };
  }

  // Aggregate by date
  const dailyStats: Record<string, { total: number; successful: number; failed: number }> = {};

  for (const record of data || []) {
    const date = new Date(record.sent_at).toISOString().split("T")[0];
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
      success_rate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const warnings: string[] = [];
  let allPassed = true;

  // Check overall success rate
  const totalSuccessful = details.reduce((sum, d) => sum + d.successful, 0);
  const totalBroadcasts = details.reduce((sum, d) => sum + d.total, 0);
  const overallSuccessRate = totalBroadcasts > 0 ? (totalSuccessful / totalBroadcasts) * 100 : 100;

  if (overallSuccessRate < 90) {
    warnings.push(`⚠️ 警告: 過去7日間の配信成功率が${overallSuccessRate.toFixed(1)}%です（目標: 90%以上）`);
    allPassed = false;
  }

  // Check consecutive failures
  let consecutiveFailures = 0;
  for (const day of details.slice(0, 3)) {
    if (day.failed > 0 && day.successful === 0) {
      consecutiveFailures++;
    } else {
      consecutiveFailures = 0;
    }
  }
  if (consecutiveFailures >= 3) {
    warnings.push(`🚨 緊急: 連続${consecutiveFailures}日間配信失敗しています！`);
    allPassed = false;
  }

  log("info", "Broadcast success check completed", {
    passed: allPassed,
    overallSuccessRate: overallSuccessRate.toFixed(1),
    warningCount: warnings.length,
  });

  return { passed: allPassed, warnings, details };
}

async function checkDatabaseHealth(client: SupabaseClient): Promise<{
  passed: boolean;
  warnings: string[];
  duplicates?: number;
  anomalies?: string[];
}> {
  log("info", "Checking database health");

  const warnings: string[] = [];
  let duplicates = 0;
  const anomalies: string[] = [];

  // Check for duplicate content hashes
  let hashData: number | null = null;
  let hashError: Error | null = null;
  
  try {
    const rpcResult = await client.rpc("check_duplicate_hashes");
    if (rpcResult.error) {
      hashError = rpcResult.error;
    } else {
      hashData = rpcResult.data as number;
    }
  } catch (err) {
    // If RPC function doesn't exist, use alternative query
    const { data: cards, error: cardsError } = await client
      .from("line_cards")
      .select("content_hash");
    
    if (cardsError) {
      hashError = cardsError;
    } else {
      const hashCounts: Record<string, number> = {};
      for (const card of cards || []) {
        if (card.content_hash) {
          hashCounts[card.content_hash] = (hashCounts[card.content_hash] || 0) + 1;
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
    warnings.push(`⚠️ 警告: 重複コンテンツハッシュが${duplicates}件検出されました`);
  }

  // Check for cards with abnormally high times_used
  const { data: highUsage, error: usageError } = await client
    .from("line_cards")
    .select("id, theme, times_used")
    .gt("times_used", 100)
    .order("times_used", { ascending: false })
    .limit(10);

  if (!usageError && highUsage && highUsage.length > 0) {
    const maxUsage = highUsage[0].times_used;
    if (maxUsage > 200) {
      anomalies.push(`異常に多い使用回数: ${maxUsage}回（カードID: ${highUsage[0].id}）`);
      warnings.push(`⚠️ 警告: 使用回数が異常に多いカードが検出されました（最大: ${maxUsage}回）`);
    }
  }

  const passed = warnings.length === 0;
  log("info", "Database health check completed", { passed, warningCount: warnings.length });

  return { passed, warnings, duplicates, anomalies };
}

async function performMaintenance(client: SupabaseClient): Promise<{
  archivedBroadcasts: number;
  archivedCards: number;
}> {
  log("info", "Performing monthly maintenance");

  let archivedBroadcasts = 0;
  let archivedCards = 0;

  // Archive old broadcast history (> 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  
  // Note: We don't actually delete, just mark for reference
  // In a real implementation, you might move to an archive table
  const { count: oldBroadcasts } = await client
    .from("line_card_broadcasts")
    .select("*", { count: "exact", head: true })
    .lt("sent_at", ninetyDaysAgo);

  archivedBroadcasts = oldBroadcasts || 0;

  if (archivedBroadcasts > 0) {
    log("info", "Found old broadcast records", { count: archivedBroadcasts });
    // In production, you might want to move these to an archive table
    // For now, we just log the count
  }

  // Archive unused cards (> 1 year unused)
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: unusedCards, error: unusedError } = await client
    .from("line_cards")
    .select("id")
    .eq("status", "ready")
    .or(`last_used_at.is.null,last_used_at.lt.${oneYearAgo}`)
    .limit(100); // Limit to avoid too many updates at once

  if (!unusedError && unusedCards && unusedCards.length > 0) {
    const { count } = await client
      .from("line_cards")
      .update({ status: "archived" })
      .in("id", unusedCards.map((c) => c.id))
      .select("*", { count: "exact", head: true });

    archivedCards = count || 0;
    log("info", "Archived unused cards", { count: archivedCards });
  }

  return { archivedBroadcasts, archivedCards };
}

async function sendDiscordNotification(result: AuditResult): Promise<void> {
  if (!DISCORD_ADMIN_WEBHOOK_URL) {
    log("warn", "Discord webhook URL not configured, skipping notification");
    return;
  }

  const emoji = result.summary.allPassed ? "✅" : result.summary.errorCount > 0 ? "🚨" : "⚠️";
  const statusText = result.summary.allPassed
    ? "全て正常"
    : result.summary.errorCount > 0
    ? "エラー検出"
    : "警告あり";

  let message = `${emoji} **Manus監査レポート** (${result.mode})\n`;
  message += `時刻: ${new Date(result.timestamp).toLocaleString("ja-JP")}\n`;
  message += `ステータス: **${statusText}**\n\n`;

  // Card inventory
  message += `**📊 カード在庫**\n`;
  if (result.checks.cardInventory.warnings.length > 0) {
    message += result.checks.cardInventory.warnings.join("\n") + "\n";
  } else {
    message += "✅ 全てのテーマで十分な在庫があります\n";
  }
  message += "\n";

  // Broadcast success
  message += `**📈 配信成功率**\n`;
  if (result.checks.broadcastSuccess.warnings.length > 0) {
    message += result.checks.broadcastSuccess.warnings.join("\n") + "\n";
  } else {
    message += "✅ 配信成功率は正常です\n";
  }
  message += "\n";

  // Database health (monthly only)
  if (result.checks.databaseHealth) {
    message += `**🔍 データベース健全性**\n`;
    if (result.checks.databaseHealth.warnings.length > 0) {
      message += result.checks.databaseHealth.warnings.join("\n") + "\n";
    } else {
      message += "✅ データベースは健全です\n";
    }
    message += "\n";
  }

  // Maintenance results (monthly only)
  if (result.maintenance) {
    message += `**🔧 メンテナンス結果**\n`;
    message += `- アーカイブ対象の配信履歴: ${result.maintenance.archivedBroadcasts}件\n`;
    message += `- アーカイブしたカード: ${result.maintenance.archivedCards}件\n`;
    message += "\n";
  }

  message += `**サマリー**: ${result.summary.warningCount}件の警告、${result.summary.errorCount}件のエラー`;

  try {
    await fetch(DISCORD_ADMIN_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    log("info", "Discord notification sent");
  } catch (error) {
    log("error", "Failed to send Discord notification", { error: error instanceof Error ? error.message : String(error) });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!verifyAuth(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") || "daily") as AuditMode;

    log("info", "Starting audit", { mode });

    const result: AuditResult = {
      timestamp: new Date().toISOString(),
      mode,
      checks: {
        cardInventory: await checkCardInventory(supabaseClient),
        broadcastSuccess: await checkBroadcastSuccess(supabaseClient),
      },
      summary: {
        allPassed: true,
        warningCount: 0,
        errorCount: 0,
      },
    };

    // Monthly checks
    if (mode === "monthly") {
      result.checks.databaseHealth = await checkDatabaseHealth(supabaseClient);
      result.maintenance = await performMaintenance(supabaseClient);
    }

    // Calculate summary
    result.summary.warningCount = [
      ...result.checks.cardInventory.warnings,
      ...result.checks.broadcastSuccess.warnings,
      ...(result.checks.databaseHealth?.warnings || []),
    ].length;

    result.summary.errorCount = [
      !result.checks.cardInventory.passed,
      !result.checks.broadcastSuccess.passed,
      result.checks.databaseHealth && !result.checks.databaseHealth.passed,
    ].filter(Boolean).length;

    result.summary.allPassed = result.summary.warningCount === 0 && result.summary.errorCount === 0;

    // Send Discord notification
    await sendDiscordNotification(result);

    log("info", "Audit completed", {
      mode,
      allPassed: result.summary.allPassed,
      warningCount: result.summary.warningCount,
      errorCount: result.summary.errorCount,
    });

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    log("error", "Audit failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});


