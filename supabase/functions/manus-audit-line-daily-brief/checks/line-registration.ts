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

// ===================
// 設定定数
// ===================

// タイムアウト設定（LINE APIの推奨値: 5秒以内）
const API_TIMEOUT_MS = 5000;
// 静的コンテンツ用タイムアウト（3秒で十分）
const LANDING_PAGE_TIMEOUT_MS = 3000;

// LIFF ID（環境変数から取得、フォールバック値あり）
const LIFF_ID = Deno.env.get("LIFF_ID") ?? "2008640048-jnoneGgO";

// LINE API設定
const LINE_API_BASE = "https://api.line.me";

// インタラクション鮮度（ビジネス要件: 2日以内を「最近」と定義）
const INTERACTION_FRESHNESS_HOURS = 48;

// PostgreSQLテーブル不存在エラーコード
const TABLE_NOT_FOUND_CODES = ["PGRST116", "42P01"];

// Google Sheets設定
const MEMBERS_SHEET_TAB = "members";

interface CheckConfig {
  supabaseUrl: string;
  landingPageUrl: string;
  // lineChannelAccessToken は環境変数から直接取得するため削除
  googleSaJson?: string | undefined;
  membersSheetId?: string | undefined;
}

/**
 * エラーメッセージをフォーマット（詳細情報付き）
 */
function formatError(action: string, error: unknown): string {
  if (error instanceof Error) {
    return `${action} - ${error.message}`;
  }
  if (typeof error === "string") {
    return `${action} - ${error}`;
  }
  return `${action} - ${JSON.stringify(error)}`;
}

/**
 * fetch エラーを共通処理するハンドラー
 * タイムアウトとその他のエラーを区別して処理
 */
function handleFetchError(
  error: unknown,
  timeoutMs: number,
  action: string,
): { passed: false; error: string } {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { passed: false, error: `タイムアウト (${timeoutMs}ms)` };
  }
  return { passed: false, error: formatError(action, error) };
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

  // 全チェックを並列実行（Promise.allSettledで1つの失敗が他に影響しない）
  const results = await Promise.allSettled([
    checkWebhookHealth(config.supabaseUrl),
    checkApiHealth(config.supabaseUrl, client),
    checkGoogleSheetsSync(config.googleSaJson, config.membersSheetId),
    checkLandingPageAccess(config.landingPageUrl),
    checkLineBotHealth(),
    checkRecentInteractions(client),
  ]);

  // 結果を展開（rejectedの場合はデフォルト値を使用）
  const defaultResult = { passed: false, error: "チェック実行失敗" };
  const [
    webhookHealth,
    apiHealth,
    googleSheetsSync,
    landingPageAccess,
    lineBotHealth,
    recentInteractions,
  ] = results.map((r) =>
    r.status === "fulfilled" ? r.value : defaultResult
  ) as [
    ResponseTimeHealthResult,
    ResponseTimeHealthResult,
    SheetsSyncResult,
    ResponseTimeHealthResult,
    LineBotHealthResult,
    RecentInteractionsResult,
  ];

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

  // インタラクション チェック（情報提供のみ、警告カウントに含めない）
  // ユーザーアクティビティがなくても、システムの健全性には影響しない
  if (!recentInteractions.passed && recentInteractions.error) {
    log.info("No recent interactions", { error: recentInteractions.error });
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
    return handleFetchError(error, API_TIMEOUT_MS, "LINE Webhook接続失敗");
  }
}

/**
 * LINE登録API の疎通チェック
 * テスト用レコードは作成後に即削除（ゴーストレコード防止）
 */
async function checkApiHealth(
  supabaseUrl: string,
  client: SupabaseClient,
): Promise<ResponseTimeHealthResult> {
  const testEmail = `manus-audit-${Date.now()}@example.com`;
  try {
    const { response, responseTime } = await fetchWithTimeout(
      `${supabaseUrl}/functions/v1/line-register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          opt_in_email: false,
        }),
      },
    );

    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        log.info("LINE register API is healthy", { responseTime });
        // テスト用レコードを即時削除
        const { error: deleteError } = await client
          .from("members")
          .delete()
          .eq("email", testEmail);
        if (deleteError) {
          log.warn("Failed to cleanup audit test record", {
            email: testEmail,
            error: deleteError.message,
          });
        } else {
          log.info("Audit test record cleaned up", { email: testEmail });
        }
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
    return handleFetchError(error, API_TIMEOUT_MS, "LINE登録API接続失敗");
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
    return handleFetchError(
      error,
      LANDING_PAGE_TIMEOUT_MS,
      "ランディングページ接続失敗",
    );
  }
}

/**
 * LINE Bot API の認証確認（Bot情報取得）
 * 環境変数から直接トークンを取得（セキュリティ向上）
 */
async function checkLineBotHealth(): Promise<LineBotHealthResult> {
  const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");

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
    return handleFetchError(error, API_TIMEOUT_MS, "LINE Bot API接続失敗");
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
