/**
 * Manus Audit for LINE Daily Brief
 *
 * Performs daily/weekly audits and monthly maintenance for the LINE Daily Brief system.
 *
 * Audit checks:
 * - Card inventory: Warn if any theme has < 50 ready cards
 * - Broadcast success rate: Warn if success rate < 90% in last 7 days
 * - Database health (monthly): Detect duplicates, anomalies
 * - LINE registration system: API health, Google Sheets sync, landing page
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
 *   - mode=health: Health check only (returns 200 if function is running)
 *   - test=true: Test mode (inject simulated errors)
 */

import { createClient } from "@supabase/supabase-js";
import { createLogger } from "../_shared/logger.ts";
import { triggerAutoRemediation } from "../_shared/manus-api.ts";
import { verifyAuth } from "./auth.ts";
import {
  checkBroadcastSuccess,
  checkCardInventory,
  checkDatabaseHealth,
  checkLineRegistrationSystem,
} from "./checks/index.ts";
import { performMaintenance } from "./maintenance.ts";
import {
  sendDiscordNotification,
  sendManusNotification,
} from "./notification.ts";
import { AuditMode, AuditResult, AuditTrigger } from "./types.ts";

const log = createLogger("manus-audit");

// Environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MANUS_AUDIT_API_KEY = Deno.env.get("MANUS_AUDIT_API_KEY");
const DISCORD_ADMIN_WEBHOOK_URL = Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL");
const DISCORD_MAINT_WEBHOOK_URL = Deno.env.get("DISCORD_MAINT_WEBHOOK_URL");
const MANUS_WEBHOOK_URL = Deno.env.get("MANUS_WEBHOOK_URL");
const LANDING_PAGE_URL = Deno.env.get("LANDING_PAGE_URL") ?? "";

// Validate required environment variables
function validateEnv(): { valid: boolean; error?: string } {
  if (!SUPABASE_URL) {
    return { valid: false, error: "Missing SUPABASE_URL" };
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return { valid: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" };
  }
  return { valid: true };
}

Deno.serve(async (req) => {
  // Health check endpoint
  const url = new URL(req.url);
  if (url.searchParams.get("mode") === "health") {
    const envCheck = validateEnv();
    if (!envCheck.valid) {
      return new Response(
        JSON.stringify({ status: "unhealthy", error: envCheck.error }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate environment
  const envCheck = validateEnv();
  if (!envCheck.valid) {
    return new Response(
      JSON.stringify({ error: envCheck.error }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Authenticate
  if (
    !verifyAuth(req, {
      apiKey: MANUS_AUDIT_API_KEY,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY!,
    })
  ) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const mode = (url.searchParams.get("mode") || "daily") as AuditMode;
    const isReportMode = url.searchParams.get("mode") === "report";
    const isTestMode = url.searchParams.get("test") === "true";
    const effectiveMode: AuditMode = isReportMode ? "daily" : mode;
    const triggerMode: AuditTrigger = isReportMode ? "report" : effectiveMode;

    log.info("Starting audit", {
      mode: triggerMode,
      effectiveMode,
      report: isReportMode,
      test: isTestMode,
    });

    const supabaseClient = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Run core checks in parallel
    const [cardInventory, broadcastSuccess] = await Promise.all([
      checkCardInventory(supabaseClient),
      checkBroadcastSuccess(supabaseClient),
    ]);

    const result: AuditResult = {
      timestamp: new Date().toISOString(),
      mode: triggerMode,
      checks: {
        cardInventory,
        broadcastSuccess,
      },
      summary: {
        allPassed: true,
        warningCount: 0,
        errorCount: 0,
      },
    };

    // Test mode: inject simulated errors
    if (isTestMode) {
      log.info("Test mode: injecting simulated errors");
      result.checks.cardInventory = {
        ...result.checks.cardInventory,
        passed: false,
        warnings: [
          "🧪 [TEST] カード在庫不足をシミュレート",
          "⚠️ 警告: testテーマのreadyカードが10枚（50枚未満）",
        ],
      };
    }

    // Monthly checks
    if (effectiveMode === "monthly") {
      const [databaseHealth, maintenance] = await Promise.all([
        checkDatabaseHealth(supabaseClient),
        performMaintenance(supabaseClient),
      ]);
      result.checks.databaseHealth = databaseHealth;
      result.maintenance = maintenance;
    }

    // LINE registration system checks
    result.checks.lineRegistrationSystem = await checkLineRegistrationSystem(
      supabaseClient,
      { supabaseUrl: SUPABASE_URL!, landingPageUrl: LANDING_PAGE_URL },
    );

    // Calculate summary
    result.summary.warningCount = [
      ...result.checks.cardInventory.warnings,
      ...result.checks.broadcastSuccess.warnings,
      ...(result.checks.databaseHealth?.warnings || []),
      ...(result.checks.lineRegistrationSystem?.warnings || []),
    ].length;

    result.summary.errorCount = [
      !result.checks.cardInventory.passed,
      !result.checks.broadcastSuccess.passed,
      result.checks.databaseHealth && !result.checks.databaseHealth.passed,
      result.checks.lineRegistrationSystem &&
      !result.checks.lineRegistrationSystem.passed,
    ].filter(Boolean).length;

    result.summary.allPassed = result.summary.warningCount === 0 &&
      result.summary.errorCount === 0;

    // Trigger auto-remediation if there are issues
    if (!result.summary.allPassed && !isReportMode) {
      log.info("Triggering auto-remediation via Manus", {
        warningCount: result.summary.warningCount,
        errorCount: result.summary.errorCount,
      });

      const remediationResult = await triggerAutoRemediation(result);
      result.remediation = {
        triggered: true,
        taskId: remediationResult.taskId,
        taskUrl: remediationResult.taskUrl,
        error: remediationResult.error,
      };

      if (remediationResult.success) {
        log.info("Auto-remediation task created", {
          taskId: remediationResult.taskId,
          taskUrl: remediationResult.taskUrl,
        });
      } else {
        log.warn("Auto-remediation failed", { error: remediationResult.error });
      }
    }

    // Send notifications
    if (isReportMode) {
      await Promise.all([
        sendManusNotification(result, {
          force: true,
          webhookUrl: MANUS_WEBHOOK_URL,
        }),
        sendDiscordNotification(result, {
          force: true,
          webhookUrl: DISCORD_MAINT_WEBHOOK_URL,
          audience: "maintenance",
        }),
      ]);
    } else {
      await sendDiscordNotification(result, {
        force: true,
        webhookUrl: DISCORD_ADMIN_WEBHOOK_URL,
        audience: "admin",
      });
    }

    log.info("Audit completed", {
      mode,
      allPassed: result.summary.allPassed,
      warningCount: result.summary.warningCount,
      errorCount: result.summary.errorCount,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    log.error("Audit failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
