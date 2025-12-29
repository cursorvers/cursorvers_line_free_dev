/**
 * LINE登録システムチェック
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "../../_shared/logger.ts";
import { LineRegistrationCheckResult } from "../types.ts";

const log = createLogger("audit-line-registration");

const API_TIMEOUT_MS = 5000;
const LANDING_PAGE_TIMEOUT_MS = 3000;
const SYNC_FRESHNESS_MS = 60 * 60 * 1000; // 1 hour
const LIFF_ID = "2008640048-jnoneGgO";

interface CheckConfig {
  supabaseUrl: string;
  landingPageUrl: string;
}

export async function checkLineRegistrationSystem(
  client: SupabaseClient,
  config: CheckConfig,
): Promise<LineRegistrationCheckResult> {
  log.info("Checking LINE registration system");

  const warnings: string[] = [];
  let allPassed = true;

  // 0. Check LINE Webhook health (リッチメニュー応答用)
  const webhookHealth = await checkWebhookHealth(config.supabaseUrl);
  if (!webhookHealth.passed) {
    allPassed = false;
    if (webhookHealth.error) {
      warnings.push(`🚨 LINE Webhook: ${webhookHealth.error}`);
    }
  }
  if (webhookHealth.responseTime && webhookHealth.responseTime > API_TIMEOUT_MS) {
    warnings.push(
      `⚠️ LINE Webhook: レスポンス時間が遅い (${webhookHealth.responseTime}ms)`,
    );
  }

  // 1. Check LINE register API health
  const apiHealth = await checkApiHealth(config.supabaseUrl);
  if (!apiHealth.passed) {
    allPassed = false;
    if (apiHealth.error) {
      if (apiHealth.error.startsWith("HTTP")) {
        warnings.push(`🚨 LINE登録API: HTTPエラー ${apiHealth.error}`);
      } else {
        warnings.push(`🚨 LINE登録API: ${apiHealth.error}`);
      }
    }
  }
  if (apiHealth.responseTime && apiHealth.responseTime > API_TIMEOUT_MS) {
    warnings.push(
      `⚠️ LINE登録API: レスポンス時間が遅い (${apiHealth.responseTime}ms)`,
    );
    allPassed = false;
  }

  // 2. Check Google Sheets sync
  const googleSheetsSync = await checkGoogleSheetsSync(client);
  if (!googleSheetsSync.passed) {
    allPassed = false;
    if (googleSheetsSync.error) {
      warnings.push(`⚠️ Google Sheets連携: ${googleSheetsSync.error}`);
    }
  }

  // 3. Check Landing Page access
  const landingPageAccess = await checkLandingPageAccess(config.landingPageUrl);
  if (!landingPageAccess.passed) {
    allPassed = false;
    if (landingPageAccess.error) {
      warnings.push(`🚨 ランディングページ: ${landingPageAccess.error}`);
    }
  }
  if (
    landingPageAccess.responseTime &&
    landingPageAccess.responseTime > LANDING_PAGE_TIMEOUT_MS
  ) {
    warnings.push(
      `⚠️ ランディングページ: レスポンス時間が遅い (${landingPageAccess.responseTime}ms)`,
    );
    allPassed = false;
  }

  log.info("LINE registration system check completed", {
    passed: allPassed,
    warningCount: warnings.length,
  });

  return {
    passed: allPassed,
    warnings,
    details: {
      webhookHealth,
      apiHealth,
      googleSheetsSync,
      landingPageAccess,
    },
  };
}

/**
 * LINE Webhook の疎通チェック（GETリクエスト）
 */
async function checkWebhookHealth(
  supabaseUrl: string,
): Promise<{ passed: boolean; responseTime?: number; error?: string }> {
  try {
    const startTime = Date.now();
    const response = await fetch(`${supabaseUrl}/functions/v1/line-webhook`, {
      method: "GET",
    });
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const text = await response.text();
      if (text.includes("line-webhook is running")) {
        log.info("LINE Webhook is healthy", { responseTime });
        return { passed: true, responseTime };
      } else {
        return {
          passed: false,
          responseTime,
          error: `予期しないレスポンス: ${text.slice(0, 50)}`,
        };
      }
    } else {
      return {
        passed: false,
        responseTime,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    return {
      passed: false,
      error: `接続失敗 - ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

async function checkApiHealth(
  supabaseUrl: string,
): Promise<{ passed: boolean; responseTime?: number; error?: string }> {
  try {
    const startTime = Date.now();
    const response = await fetch(`${supabaseUrl}/functions/v1/line-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `manus-audit-${Date.now()}@example.com`,
        opt_in_email: true,
      }),
    });
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        log.info("LINE register API is healthy", { responseTime });
        return { passed: true, responseTime };
      } else {
        return {
          passed: false,
          responseTime,
          error: data.error || "Unknown error",
        };
      }
    } else {
      return {
        passed: false,
        responseTime,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    return {
      passed: false,
      error: `接続失敗 - ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

async function checkGoogleSheetsSync(
  client: SupabaseClient,
): Promise<{ passed: boolean; lastUpdate?: string; error?: string }> {
  try {
    const { data, error } = await client
      .from("members")
      .select("email, updated_at")
      .like("email", "manus-audit-%@example.com")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return {
        passed: false,
        error: `データベース確認失敗 - ${error.message}`,
      };
    }

    if (data) {
      const lastUpdateTime = new Date(data.updated_at).getTime();
      const now = Date.now();
      if (now - lastUpdateTime > SYNC_FRESHNESS_MS) {
        return {
          passed: false,
          lastUpdate: data.updated_at,
          error: `最終更新が1時間以上前 (${data.updated_at})`,
        };
      }

      log.info("Google Sheets sync is working", {
        lastUpdate: data.updated_at,
      });
      return { passed: true, lastUpdate: data.updated_at };
    }

    return {
      passed: false,
      error: "最近の監査データが見つかりません",
    };
  } catch (error) {
    return {
      passed: false,
      error: `チェック失敗 - ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

async function checkLandingPageAccess(
  landingPageUrl: string,
): Promise<{ passed: boolean; responseTime?: number; error?: string }> {
  try {
    const startTime = Date.now();
    const response = await fetch(landingPageUrl, { method: "GET" });
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const html = await response.text();
      if (html.includes(LIFF_ID)) {
        log.info("Landing page is accessible", { responseTime });
        return { passed: true, responseTime };
      } else {
        return {
          passed: false,
          responseTime,
          error: "LIFF IDが見つかりません",
        };
      }
    } else {
      return {
        passed: false,
        responseTime,
        error: `HTTPエラー ${response.status}`,
      };
    }
  } catch (error) {
    return {
      passed: false,
      error: `アクセス失敗 - ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
