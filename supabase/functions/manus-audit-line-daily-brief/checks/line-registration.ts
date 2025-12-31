/**
 * LINE登録システムチェック
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { createSheetsClientFromEnv } from "../../_shared/google-sheets.ts";
import { createLogger } from "../../_shared/logger.ts";
import {
  LineBotHealthResult,
  LineRegistrationCheckResult,
  RecentInteractionsResult,
  ResponseTimeHealthResult,
  SheetsSyncResult,
} from "../types.ts";

const log = createLogger("audit-line-registration");

// タイムアウト設定
const API_TIMEOUT_MS = 5000;
const LANDING_PAGE_TIMEOUT_MS = 3000;
const LIFF_ID = "2008640048-jnoneGgO";

// LINE API設定
const LINE_API_BASE = "https://api.line.me";
const INTERACTION_FRESHNESS_HOURS = 48;

// テーブル不存在エラーコード
const TABLE_NOT_FOUND_CODES = ["PGRST116", "42P01"];

// Google Sheets設定
const MEMBERS_SHEET_TAB = "members";

interface CheckConfig {
  supabaseUrl: string;
  landingPageUrl: string;
  lineChannelAccessToken?: string | undefined;
  googleSaJson?: string | undefined;
  membersSheetId?: string | undefined;
}

/**
 * エラーメッセージをフォーマット
 */
function formatError(action: string, error: unknown): string {
  return `${action} - ${
    error instanceof Error ? error.message : String(error)
  }`;
}

/**
 * タイムアウト付きfetch
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<{ response: Response; responseTime: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const responseTime = Date.now() - startTime;
    return { response, responseTime };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkLineRegistrationSystem(
  client: SupabaseClient,
  config: CheckConfig,
): Promise<LineRegistrationCheckResult> {
  log.info("Checking LINE registration system");

  // 全チェックを並列実行
  const [
    webhookHealth,
    apiHealth,
    googleSheetsSync,
    landingPageAccess,
    lineBotHealth,
    recentInteractions,
  ] = await Promise.all([
    checkWebhookHealth(config.supabaseUrl),
    checkApiHealth(config.supabaseUrl),
    checkGoogleSheetsSync(config.googleSaJson, config.membersSheetId),
    checkLandingPageAccess(config.landingPageUrl),
    checkLineBotHealth(config.lineChannelAccessToken),
    checkRecentInteractions(client),
  ]);

  // 警告を集約
  const warnings: string[] = [];
  let allPassed = true;

  // Webhook チェック
  if (!webhookHealth.passed) {
    allPassed = false;
    if (webhookHealth.error) {
      warnings.push(`🚨 LINE Webhook: ${webhookHealth.error}`);
    }
  }
  if (
    webhookHealth.responseTime && webhookHealth.responseTime > API_TIMEOUT_MS
  ) {
    warnings.push(
      `⚠️ LINE Webhook: レスポンス時間が遅い (${webhookHealth.responseTime}ms)`,
    );
  }

  // 登録API チェック
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

  // Google Sheets連携 チェック
  if (!googleSheetsSync.passed) {
    allPassed = false;
    if (googleSheetsSync.error) {
      warnings.push(`⚠️ Google Sheets連携: ${googleSheetsSync.error}`);
    }
  }

  // ランディングページ チェック
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

  // LINE Bot API チェック
  if (!lineBotHealth.passed) {
    allPassed = false;
    if (lineBotHealth.error) {
      warnings.push(`🚨 LINE Bot API: ${lineBotHealth.error}`);
    }
  }

  // インタラクション チェック（警告のみ）
  if (!recentInteractions.passed) {
    if (recentInteractions.error) {
      warnings.push(`⚠️ LINE応答: ${recentInteractions.error}`);
    }
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
      lineBotHealth,
      recentInteractions,
    },
  };
}

/**
 * LINE Webhook の疎通チェック（GETリクエスト）
 */
async function checkWebhookHealth(
  supabaseUrl: string,
): Promise<ResponseTimeHealthResult> {
  try {
    const { response, responseTime } = await fetchWithTimeout(
      `${supabaseUrl}/functions/v1/line-webhook`,
      { method: "GET" },
    );

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
    if (error instanceof DOMException && error.name === "AbortError") {
      return { passed: false, error: `タイムアウト (${API_TIMEOUT_MS}ms)` };
    }
    return { passed: false, error: formatError("接続失敗", error) };
  }
}

/**
 * LINE登録API の疎通チェック
 */
async function checkApiHealth(
  supabaseUrl: string,
): Promise<ResponseTimeHealthResult> {
  try {
    const { response, responseTime } = await fetchWithTimeout(
      `${supabaseUrl}/functions/v1/line-register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `manus-audit-${Date.now()}@example.com`,
          opt_in_email: true,
        }),
      },
    );

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
    if (error instanceof DOMException && error.name === "AbortError") {
      return { passed: false, error: `タイムアウト (${API_TIMEOUT_MS}ms)` };
    }
    return { passed: false, error: formatError("接続失敗", error) };
  }
}

/**
 * Google Sheets連携の確認（実際のAPI接続テスト）
 */
async function checkGoogleSheetsSync(
  googleSaJson?: string,
  membersSheetId?: string,
): Promise<SheetsSyncResult> {
  // 設定がない場合はスキップ（passed: true）
  if (!googleSaJson || !membersSheetId) {
    log.info("Google Sheets not configured, skipping check");
    return { passed: true };
  }

  try {
    const client = await createSheetsClientFromEnv(
      googleSaJson,
      membersSheetId,
    );
    const metadata = await client.getMetadata(MEMBERS_SHEET_TAB);

    log.info("Google Sheets API connection verified", {
      tabName: metadata.title,
      rowCount: metadata.rowCount,
    });

    return {
      passed: true,
      rowCount: metadata.rowCount,
    };
  } catch (error) {
    return {
      passed: false,
      error: formatError("Google Sheets API接続失敗", error),
    };
  }
}

/**
 * ランディングページのアクセス確認
 */
async function checkLandingPageAccess(
  landingPageUrl: string,
): Promise<ResponseTimeHealthResult> {
  try {
    const { response, responseTime } = await fetchWithTimeout(
      landingPageUrl,
      { method: "GET" },
      LANDING_PAGE_TIMEOUT_MS,
    );

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
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        passed: false,
        error: `タイムアウト (${LANDING_PAGE_TIMEOUT_MS}ms)`,
      };
    }
    return { passed: false, error: formatError("アクセス失敗", error) };
  }
}

/**
 * LINE Bot API の認証確認（Bot情報取得）
 */
async function checkLineBotHealth(
  accessToken?: string,
): Promise<LineBotHealthResult> {
  if (!accessToken) {
    return {
      passed: false,
      error: "LINE_CHANNEL_ACCESS_TOKEN未設定",
    };
  }

  try {
    const { response } = await fetchWithTimeout(
      `${LINE_API_BASE}/v2/bot/info`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (response.ok) {
      const data = await response.json();
      log.info("LINE Bot API is healthy", { botName: data.displayName });
      return { passed: true, botName: data.displayName };
    } else if (response.status === 401) {
      return {
        passed: false,
        error: "トークン無効または期限切れ (401)",
      };
    } else {
      return {
        passed: false,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { passed: false, error: `タイムアウト (${API_TIMEOUT_MS}ms)` };
    }
    return { passed: false, error: formatError("API接続失敗", error) };
  }
}

/**
 * 最近のインタラクション確認
 */
async function checkRecentInteractions(
  client: SupabaseClient,
): Promise<RecentInteractionsResult> {
  try {
    const hoursAgo = new Date(
      Date.now() - INTERACTION_FRESHNESS_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const { data, error, count } = await client
      .from("interaction_logs")
      .select("created_at", { count: "exact" })
      .gte("created_at", hoursAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      // テーブルが存在しない場合はスキップ
      if (TABLE_NOT_FOUND_CODES.includes(error.code)) {
        log.info("interaction_logs table not found, skipping check");
        return { passed: true };
      }
      return {
        passed: false,
        error: formatError("DB確認失敗", error),
      };
    }

    if (count && count > 0 && data && data.length > 0) {
      const latestInteraction = data[0];
      if (latestInteraction) {
        log.info("Recent interactions found", {
          count,
          lastInteraction: latestInteraction.created_at,
        });
        return {
          passed: true,
          lastInteraction: latestInteraction.created_at,
          count,
        };
      }
    }

    return {
      passed: false,
      count: 0,
      error: `過去${INTERACTION_FRESHNESS_HOURS}時間以内のインタラクションなし`,
    };
  } catch (error) {
    return { passed: false, error: formatError("チェック失敗", error) };
  }
}
