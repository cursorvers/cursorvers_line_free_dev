/**
 * Manus Intelligent Repair - AI判断と自動修繕を実行
 *
 * 監査結果を受け取り、AIで診断・判断・修繕を実行する。
 * GitHub Actionsからも直接呼び出せる。
 *
 * POST /manus-intelligent-repair
 * Headers:
 *   - X-API-Key: MANUS_REPAIR_API_KEY
 *   - OR Authorization: Bearer <service_role_key>
 *
 * Body:
 * {
 *   "audit_result": { ... },  // AuditResultオブジェクト
 *   "trigger": "scheduled" | "manual" | "webhook",
 *   "options": {
 *     "dry_run": false,       // true: 実行せず計画のみ返す
 *     "auto_escalate": true,  // 修繕失敗時にIssue作成
 *     "notify": ["discord", "line"]
 *   }
 * }
 *
 * Response:
 * {
 *   "diagnosis": { ... },     // AI診断結果
 *   "plan": [ ... ],          // 修繕計画
 *   "executed": [ ... ],      // 実行結果
 *   "summary": { ... }        // サマリー
 * }
 */

import { createClient } from "@supabase/supabase-js";
import { parseRequiredJsonBody } from "../_shared/http-utils.ts";
import { createLogger } from "../_shared/logger.ts";
import type { AuditResult } from "../manus-audit-line-daily-brief/types.ts";
import {
  classifyRepairOverallStatus,
  ensureGitHubApiOk,
  ManualInterventionRequiredError,
  normalizeGitHubRepoAllowlist,
  preflightGitHubAccess,
  resolveGitHubAuthContext,
} from "./repair-utils.ts";

const log = createLogger("manus-intelligent-repair");

// Environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const MANUS_REPAIR_API_KEY = Deno.env.get("MANUS_REPAIR_API_KEY");
const DISCORD_SYSTEM_WEBHOOK = Deno.env.get("DISCORD_SYSTEM_WEBHOOK");
const MANUS_GITHUB_TOKEN = Deno.env.get("MANUS_GITHUB_TOKEN");
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ??
  "cursorvers/cursorvers_line_free_dev";
const GITHUB_ALLOWED_REPOS = normalizeGitHubRepoAllowlist(
  Deno.env.get("MANUS_ALLOWED_GITHUB_REPOS"),
  [GITHUB_REPO],
);

// 外部API呼び出しのデフォルトタイムアウト（ミリ秒）
const DEFAULT_API_TIMEOUT = 15000;

// ============================================================
// Utilities
// ============================================================

/**
 * タイムアウト付きfetch（外部API呼び出し用）
 * タイムアウト時はAbortErrorをスロー
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_API_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`API request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

const githubFetch: typeof fetch = (input, init) =>
  fetchWithTimeout(String(input), init);

async function withGitHubManualIntervention<T>(
  actionLabel: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ManualInterventionRequiredError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new ManualInterventionRequiredError(
      `${actionLabel}: manual intervention required (${message})`,
    );
  }
}

// ============================================================
// Types
// ============================================================

/** 問題タイプ */
type IssueType =
  | "card_inventory_low"
  | "broadcast_failure"
  | "database_anomaly"
  | "line_webhook_error"
  | "line_api_error"
  | "landing_page_error"
  | "unknown";

/** 修繕アクション */
type RepairAction =
  | "generate_cards"
  | "redeploy_function"
  | "reset_secret"
  | "fix_database"
  | "restart_service"
  | "escalate_to_human"
  | "no_action_needed";

/** 診断結果 */
interface Diagnosis {
  issues: DiagnosedIssue[];
  severity: "critical" | "high" | "medium" | "low";
  confidence: number; // 0-100
}

interface DiagnosedIssue {
  type: IssueType;
  description: string;
  rootCause: string;
  suggestedActions: RepairAction[];
  priority: number; // 1-10
}

/** 修繕計画 */
interface RepairPlan {
  steps: RepairStep[];
  estimatedDuration: string;
  requiresHumanApproval: boolean;
}

interface RepairStep {
  action: RepairAction;
  target: string;
  params: Record<string, unknown>;
  order: number;
  rollbackable: boolean;
}

/** 実行結果 */
interface ExecutionResult {
  step: RepairStep;
  status: "success" | "failed" | "skipped";
  output?: string | undefined;
  error?: string | undefined;
  duration: number; // ms
}

/** リクエスト */
interface RepairRequest {
  audit_result: AuditResult;
  trigger: "scheduled" | "manual" | "webhook";
  options: {
    dry_run?: boolean | undefined;
    auto_escalate?: boolean | undefined;
    notify?: string[] | undefined;
  };
}

/** レスポンス */
interface RepairResponse {
  diagnosis: Diagnosis;
  plan: RepairPlan;
  executed: ExecutionResult[];
  summary: {
    totalSteps: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    overallStatus: "success" | "partial" | "failed" | "dry_run";
  };
}

const VALID_CARD_THEMES = [
  "ai_gov",
  "tax",
  "law",
  "biz",
  "career",
  "asset",
  "general",
] as const;

type CardTheme = typeof VALID_CARD_THEMES[number];

// ============================================================
// Authentication
// ============================================================

function verifyAuth(req: Request): boolean {
  // X-API-Key header
  const apiKey = req.headers.get("X-API-Key");
  if (apiKey && MANUS_REPAIR_API_KEY && apiKey === MANUS_REPAIR_API_KEY) {
    return true;
  }

  // Bearer token (service role key)
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      return true;
    }
  }

  return false;
}

// ============================================================
// AI Diagnosis - 問題を分析して根本原因を特定
// ============================================================

/** Severity優先度マップ */
const SEVERITY_PRIORITY: Record<Diagnosis["severity"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** 現在のseverityより高い場合のみ更新 */
function upgradeSeverity(
  current: Diagnosis["severity"],
  proposed: Diagnosis["severity"],
): Diagnosis["severity"] {
  return SEVERITY_PRIORITY[proposed] > SEVERITY_PRIORITY[current]
    ? proposed
    : current;
}

function diagnoseIssues(auditResult: AuditResult): Diagnosis {
  const issues: DiagnosedIssue[] = [];
  let maxSeverity: Diagnosis["severity"] = "low";

  // カード在庫問題の診断
  if (!auditResult.checks.cardInventory.passed) {
    const warnings = auditResult.checks.cardInventory.warnings;
    const details = auditResult.checks.cardInventory.details;

    // 在庫不足のテーマを特定
    const lowThemes = details.filter((d) => d.ready_cards < 30);

    issues.push({
      type: "card_inventory_low",
      description: `${lowThemes.length}テーマでカード在庫が不足`,
      rootCause: analyzeCardInventoryRootCause(lowThemes, warnings),
      suggestedActions: ["generate_cards"],
      priority: lowThemes.some((t) => t.ready_cards < 10) ? 9 : 6,
    });

    if (lowThemes.some((t) => t.ready_cards < 10)) {
      maxSeverity = upgradeSeverity(maxSeverity, "critical");
    } else if (lowThemes.some((t) => t.ready_cards < 30)) {
      maxSeverity = upgradeSeverity(maxSeverity, "high");
    }
  }

  // 配信失敗の診断
  if (!auditResult.checks.broadcastSuccess.passed) {
    const warnings = auditResult.checks.broadcastSuccess.warnings;

    issues.push({
      type: "broadcast_failure",
      description: "配信成功率が閾値を下回っている",
      rootCause: analyzeBroadcastRootCause(warnings),
      suggestedActions: ["redeploy_function", "reset_secret"],
      priority: 8,
    });

    maxSeverity = upgradeSeverity(maxSeverity, "high");
  }

  // データベース異常の診断
  if (
    auditResult.checks.databaseHealth &&
    !auditResult.checks.databaseHealth.passed
  ) {
    issues.push({
      type: "database_anomaly",
      description: "データベースに異常を検出",
      rootCause: "重複レコードまたは不整合データが存在する可能性",
      suggestedActions: ["fix_database"],
      priority: 7,
    });

    maxSeverity = upgradeSeverity(maxSeverity, "medium");
  }

  // LINE登録システムの診断
  if (
    auditResult.checks.lineRegistrationSystem &&
    !auditResult.checks.lineRegistrationSystem.passed
  ) {
    const details = auditResult.checks.lineRegistrationSystem.details;

    if (!details.webhookHealth.passed) {
      issues.push({
        type: "line_webhook_error",
        description: "LINE Webhookが応答しない",
        rootCause: details.webhookHealth.error ?? "Webhook接続エラー",
        suggestedActions: ["redeploy_function", "reset_secret"],
        priority: 10, // 最優先
      });
      maxSeverity = upgradeSeverity(maxSeverity, "critical");
    }

    if (!details.apiHealth.passed) {
      issues.push({
        type: "line_api_error",
        description: "LINE APIヘルスチェック失敗",
        rootCause: details.apiHealth.error ?? "API接続エラー",
        suggestedActions: ["reset_secret"],
        priority: 9,
      });
      maxSeverity = upgradeSeverity(maxSeverity, "critical");
    }

    if (!details.landingPageAccess.passed) {
      issues.push({
        type: "landing_page_error",
        description: "ランディングページにアクセスできない",
        rootCause: details.landingPageAccess.error ?? "ページ不達",
        suggestedActions: ["restart_service"],
        priority: 5,
      });
    }
  }

  // 問題がない場合
  if (issues.length === 0) {
    return {
      issues: [],
      severity: "low",
      confidence: 100,
    };
  }

  // 優先度でソート
  issues.sort((a, b) => b.priority - a.priority);

  return {
    issues,
    severity: maxSeverity,
    confidence: calculateConfidence(issues),
  };
}

function analyzeCardInventoryRootCause(
  lowThemes: { theme: string; ready_cards: number }[],
  warnings: string[],
): string {
  if (lowThemes.length === 0) return "不明";

  const themes = lowThemes.map((t) => `${t.theme}(${t.ready_cards}枚)`);

  // 消費速度の分析
  if (warnings.some((w) => w.includes("消費速度"))) {
    return `カード消費速度が生成速度を上回っている: ${themes.join(", ")}`;
  }

  // 生成停止の可能性
  if (warnings.some((w) => w.includes("生成"))) {
    return `カード生成が停止している可能性: ${themes.join(", ")}`;
  }

  return `在庫不足テーマ: ${themes.join(", ")}`;
}

function analyzeBroadcastRootCause(warnings: string[]): string {
  if (warnings.some((w) => w.includes("LINE"))) {
    return "LINE APIエラーによる配信失敗";
  }
  if (warnings.some((w) => w.includes("タイムアウト"))) {
    return "配信タイムアウト - サーバー負荷の可能性";
  }
  if (warnings.some((w) => w.includes("認証"))) {
    return "LINE認証エラー - トークン期限切れの可能性";
  }
  return "配信エラー原因不明 - ログ調査が必要";
}

function calculateConfidence(issues: DiagnosedIssue[]): number {
  // 未知の問題が多いほど信頼度が下がる
  const unknownCount = issues.filter((i) => i.type === "unknown").length;
  const baseConfidence = 90;
  return Math.max(50, baseConfidence - unknownCount * 15);
}

// ============================================================
// Repair Planning - 修繕計画を作成
// ============================================================

function createRepairPlan(diagnosis: Diagnosis): RepairPlan {
  const steps: RepairStep[] = [];
  let requiresHumanApproval = false;
  let order = 1;

  for (const issue of diagnosis.issues) {
    for (const action of issue.suggestedActions) {
      const step = createRepairStep(action, issue, order++);
      steps.push(step);

      if (action === "escalate_to_human") {
        requiresHumanApproval = true;
      }
    }
  }

  return {
    steps,
    estimatedDuration: estimateDuration(steps),
    requiresHumanApproval,
  };
}

function createRepairStep(
  action: RepairAction,
  issue: DiagnosedIssue,
  order: number,
): RepairStep {
  switch (action) {
    case "generate_cards": {
      const themes = extractThemesFromIssue(issue);
      const theme = themes[0] ?? "general";
      return {
        action,
        target: "line_cards",
        params: {
          theme,
          themes,
          count: 50,
        },
        order,
        rollbackable: true,
      };
    }

    case "redeploy_function":
      return {
        action,
        target: extractFunctionFromIssue(issue),
        params: {
          projectRef: "haaxgwyimoqzzxzdaeep",
          noVerifyJwt: issue.type === "line_webhook_error",
        },
        order,
        rollbackable: false,
      };

    case "reset_secret":
      return {
        action,
        target: extractSecretFromIssue(issue),
        params: {
          projectRef: "haaxgwyimoqzzxzdaeep",
        },
        order,
        rollbackable: false,
      };

    case "fix_database":
      return {
        action,
        target: "database",
        params: {
          operation: "deduplicate",
        },
        order,
        rollbackable: true,
      };

    case "restart_service":
      return {
        action,
        target: "landing_page",
        params: {},
        order,
        rollbackable: false,
      };

    default:
      return {
        action: "escalate_to_human",
        target: "github_issue",
        params: {
          issue: issue.description,
          rootCause: issue.rootCause,
        },
        order,
        rollbackable: false,
      };
  }
}

function extractThemesFromIssue(issue: DiagnosedIssue): CardTheme[] {
  const themesFromRootCause = Array.from(
    issue.rootCause.matchAll(/([a-z_]+)\(\d+枚\)/g),
    (match) => match[1],
  );

  const uniqueThemes = Array.from(new Set(themesFromRootCause))
    .filter((theme): theme is CardTheme =>
      VALID_CARD_THEMES.includes(theme as CardTheme)
    );

  if (uniqueThemes.length > 0) {
    return uniqueThemes;
  }

  const descriptionMatch = issue.description.match(/([a-z_]+)テーマ/);
  if (
    descriptionMatch?.[1] &&
    VALID_CARD_THEMES.includes(descriptionMatch[1] as CardTheme)
  ) {
    return [descriptionMatch[1] as CardTheme];
  }

  return ["general"];
}

function extractFunctionFromIssue(issue: DiagnosedIssue): string {
  if (issue.type === "line_webhook_error") return "line-webhook";
  if (issue.type === "broadcast_failure") return "line-daily-brief";
  return "line-webhook";
}

function extractSecretFromIssue(issue: DiagnosedIssue): string {
  if (
    issue.rootCause.includes("認証") || issue.rootCause.includes("トークン")
  ) {
    return "LINE_CHANNEL_ACCESS_TOKEN";
  }
  if (issue.rootCause.includes("SECRET")) {
    return "LINE_CHANNEL_SECRET";
  }
  return "LINE_CHANNEL_ACCESS_TOKEN";
}

function estimateDuration(steps: RepairStep[]): string {
  const totalSeconds = steps.reduce((acc, step) => {
    switch (step.action) {
      case "generate_cards":
        return acc + 60;
      case "redeploy_function":
        return acc + 120;
      case "reset_secret":
        return acc + 30;
      case "fix_database":
        return acc + 180;
      default:
        return acc + 60;
    }
  }, 0);

  if (totalSeconds < 60) return `${totalSeconds}秒`;
  return `${Math.ceil(totalSeconds / 60)}分`;
}

// ============================================================
// Execution - 修繕を実行
// ============================================================

async function executeRepairPlan(
  plan: RepairPlan,
  dryRun: boolean,
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  for (const step of plan.steps) {
    if (dryRun) {
      results.push({
        step,
        status: "skipped",
        output: "[DRY RUN] 実行スキップ",
        duration: 0,
      });
      continue;
    }

    const startTime = Date.now();
    try {
      const output = await executeStep(step);
      results.push({
        step,
        status: "success",
        output,
        duration: Date.now() - startTime,
      });
      log.info("Step executed successfully", {
        action: step.action,
        target: step.target,
      });
    } catch (error) {
      if (error instanceof ManualInterventionRequiredError) {
        results.push({
          step,
          status: "skipped",
          output: error.message,
          duration: Date.now() - startTime,
        });
        log.warn("Step requires manual intervention", {
          action: step.action,
          target: step.target,
          error: error.message,
        });
        continue;
      }

      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      results.push({
        step,
        status: "failed",
        error: errorMessage,
        duration: Date.now() - startTime,
      });
      log.error("Step execution failed", {
        action: step.action,
        target: step.target,
        error: errorMessage,
      });
    }
  }

  return results;
}

async function executeStep(step: RepairStep): Promise<string> {
  switch (step.action) {
    case "generate_cards":
      return await executeGenerateCards(step);

    case "redeploy_function":
      return await executeRedeployFunction(step);

    case "reset_secret":
      return await executeResetSecret(step);

    case "fix_database":
      return await executeFixDatabase(step);

    case "escalate_to_human":
      return await executeEscalate(step);

    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
}

async function executeGenerateCards(step: RepairStep): Promise<string> {
  const { theme, themes, count } = step.params as {
    theme?: string;
    themes?: string[];
    count: number;
  };
  const normalizedThemes = (Array.isArray(themes) && themes.length > 0)
    ? themes
    : [theme ?? "general"];
  const themeList = normalizedThemes.join(",");

  // GitHub Actions workflow_dispatchをトリガー
  const github = resolveGitHubAuthContext("generate_cards", {
    manusToken: MANUS_GITHUB_TOKEN,
    githubToken: GITHUB_TOKEN,
    repo: GITHUB_REPO,
    allowedRepos: GITHUB_ALLOWED_REPOS,
  });

  await withGitHubManualIntervention("generate_cards", async () => {
    await preflightGitHubAccess("generate_cards", github, githubFetch);

    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${github.repo}/actions/workflows/replenish-cards.yml/dispatches`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${github.token}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            themes: themeList,
            count: String(count),
          },
        }),
      },
    );

    await ensureGitHubApiOk("generate_cards", response);
  });

  return `カード生成ワークフローをトリガー: ${themeList} x ${count}`;
}

async function executeRedeployFunction(step: RepairStep): Promise<string> {
  const { projectRef, noVerifyJwt } = step.params as {
    projectRef: string;
    noVerifyJwt?: boolean;
  };
  const functionName = step.target;

  // GitHub Actions workflow_dispatchをトリガー
  const github = resolveGitHubAuthContext("redeploy_function", {
    manusToken: MANUS_GITHUB_TOKEN,
    githubToken: GITHUB_TOKEN,
    repo: GITHUB_REPO,
    allowedRepos: GITHUB_ALLOWED_REPOS,
  });

  await withGitHubManualIntervention("redeploy_function", async () => {
    await preflightGitHubAccess("redeploy_function", github, githubFetch);

    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${github.repo}/actions/workflows/deploy-supabase.yml/dispatches`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${github.token}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            function_name: functionName,
            no_verify_jwt: noVerifyJwt ? "true" : "false",
          },
        }),
      },
    );

    await ensureGitHubApiOk("redeploy_function", response);
  });

  return `関数再デプロイをトリガー: ${functionName} (project: ${projectRef})`;
}

async function executeResetSecret(step: RepairStep): Promise<string> {
  // シークレットのリセットは人間の介入が必要
  // GitHub Issueを作成して通知
  resolveGitHubAuthContext("reset_secret", {
    manusToken: MANUS_GITHUB_TOKEN,
    githubToken: GITHUB_TOKEN,
    repo: GITHUB_REPO,
    allowedRepos: GITHUB_ALLOWED_REPOS,
  });
  return await executeEscalate({
    ...step,
    params: {
      ...step.params,
      issue: `シークレット ${step.target} のリセットが必要`,
      rootCause: "自動リセットはセキュリティ上許可されていません",
    },
  });
}

async function executeFixDatabase(step: RepairStep): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { operation } = step.params as { operation: string };

  if (operation === "deduplicate") {
    // 重複line_idを検出して古い方を削除
    const { data: duplicates, error: dupError } = await supabase.rpc(
      "find_duplicate_line_users",
    );

    if (dupError) {
      throw new Error(`重複検出エラー: ${dupError.message}`);
    }

    if (!duplicates || duplicates.length === 0) {
      return "重複レコードなし";
    }

    // 重複の古い方を一括削除（N+1問題回避）
    const ids = duplicates.map((dup: { id: string }) => dup.id);
    const { error: deleteError } = await supabase
      .from("line_users")
      .delete()
      .in("id", ids);

    if (deleteError) {
      throw new Error(`重複削除エラー: ${deleteError.message}`);
    }

    return `${duplicates.length}件の重複レコードを削除`;
  }

  throw new Error(`Unknown database operation: ${operation}`);
}

async function executeEscalate(step: RepairStep): Promise<string> {
  const { issue, rootCause } = step.params as {
    issue?: string;
    rootCause?: string;
  };

  const github = resolveGitHubAuthContext("escalate_to_human", {
    manusToken: MANUS_GITHUB_TOKEN,
    githubToken: GITHUB_TOKEN,
    repo: GITHUB_REPO,
    allowedRepos: GITHUB_ALLOWED_REPOS,
  });

  const issueBody = `## 問題
${issue ?? "不明な問題"}

## 根本原因
${rootCause ?? "調査が必要"}

## 自動診断結果
この問題は自動修繕できませんでした。人間による対応が必要です。

---
🤖 Manus Intelligent Repair による自動生成`;

  const data = await withGitHubManualIntervention(
    "escalate_to_human",
    async () => {
      await preflightGitHubAccess("escalate_to_human", github, githubFetch);

      const response = await fetchWithTimeout(
        `https://api.github.com/repos/${github.repo}/issues`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${github.token}`,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: `🚨 [自動検出] ${issue ?? "システム異常"}`,
            body: issueBody,
            labels: ["auto-detected", "needs-human"],
          }),
        },
      );

      await ensureGitHubApiOk("escalate_to_human", response);
      return await response.json() as { number: number };
    },
  );

  return `GitHub Issue作成: #${data.number}`;
}

// ============================================================
// Notification
// ============================================================

async function sendNotification(
  response: RepairResponse,
  channels: string[],
): Promise<void> {
  const waitingForManualIntervention =
    response.summary.overallStatus === "partial" &&
    response.summary.successCount === 0 &&
    response.summary.failedCount === 0 &&
    response.summary.skippedCount > 0;
  const emoji = response.summary.overallStatus === "success"
    ? "✅"
    : response.summary.overallStatus === "partial" ||
        waitingForManualIntervention
    ? "⚠️"
    : "🚨";

  const statusText = response.summary.overallStatus === "success"
    ? "自動修繕完了"
    : waitingForManualIntervention
    ? "手動対応待ち"
    : response.summary.overallStatus === "partial"
    ? "一部修繕成功"
    : response.summary.overallStatus === "dry_run"
    ? "ドライラン完了"
    : "修繕失敗";

  let message = `${emoji} **Manus Intelligent Repair** - ${statusText}\n\n`;

  // 診断サマリー
  message += `**診断結果** (信頼度: ${response.diagnosis.confidence}%)\n`;
  message += `- 重大度: ${response.diagnosis.severity}\n`;
  message += `- 検出問題: ${response.diagnosis.issues.length}件\n\n`;

  // 実行結果
  if (response.executed.length > 0) {
    message += `**実行結果**\n`;
    message += `- 成功: ${response.summary.successCount}件\n`;
    message += `- 失敗: ${response.summary.failedCount}件\n`;
    message += `- スキップ: ${response.summary.skippedCount}件\n\n`;

    // 詳細
    for (const exec of response.executed) {
      const statusEmoji = exec.status === "success"
        ? "✅"
        : exec.status === "failed"
        ? "❌"
        : "⏭️";
      message += `${statusEmoji} ${exec.step.action}: ${
        exec.output ?? exec.error ?? "完了"
      }\n`;
    }
  }

  // Discord通知（タイムアウト5秒、失敗しても続行）
  if (channels.includes("discord") && DISCORD_SYSTEM_WEBHOOK) {
    try {
      await fetchWithTimeout(
        DISCORD_SYSTEM_WEBHOOK,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message.trim() }),
        },
        5000, // Discord通知は5秒でタイムアウト
      );
    } catch (error) {
      log.error("Discord notification failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// ============================================================
// Main Handler
// ============================================================

Deno.serve(async (req) => {
  // Health check
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("mode") === "health") {
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

  // Authentication
  if (!verifyAuth(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const parsedRequest = await parseRequiredJsonBody<RepairRequest>(req);
    if (!parsedRequest.ok) {
      return new Response(
        JSON.stringify({ error: parsedRequest.error }),
        {
          status: parsedRequest.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const request = parsedRequest.body;
    const options = request.options ?? {};
    const dryRun = options.dry_run ?? false;
    const autoEscalate = options.auto_escalate ?? true;
    const notifyChannels = options.notify ?? ["discord"];

    log.info("Starting intelligent repair", {
      trigger: request.trigger,
      dryRun,
      autoEscalate,
    });

    // 1. AI診断
    log.info("Phase 1: Diagnosis");
    const diagnosis = diagnoseIssues(request.audit_result);

    if (diagnosis.issues.length === 0) {
      log.info("No issues detected, no repair needed");
      return new Response(
        JSON.stringify({
          diagnosis,
          plan: {
            steps: [],
            estimatedDuration: "0秒",
            requiresHumanApproval: false,
          },
          executed: [],
          summary: {
            totalSteps: 0,
            successCount: 0,
            failedCount: 0,
            skippedCount: 0,
            overallStatus: "success",
          },
        } as RepairResponse),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. 修繕計画
    log.info("Phase 2: Planning", {
      issueCount: diagnosis.issues.length,
      severity: diagnosis.severity,
    });
    const plan = createRepairPlan(diagnosis);

    // 3. 修繕実行
    log.info("Phase 3: Execution", {
      stepCount: plan.steps.length,
      dryRun,
    });
    const executed = await executeRepairPlan(plan, dryRun);

    // 4. サマリー作成
    const successCount = executed.filter((e) => e.status === "success").length;
    const failedCount = executed.filter((e) => e.status === "failed").length;
    const skippedCount = executed.filter((e) => e.status === "skipped").length;

    const overallStatus = classifyRepairOverallStatus(
      dryRun,
      successCount,
      failedCount,
      skippedCount,
    );

    const response: RepairResponse = {
      diagnosis,
      plan,
      executed,
      summary: {
        totalSteps: plan.steps.length,
        successCount,
        failedCount,
        skippedCount,
        overallStatus,
      },
    };

    // 5. 通知
    if (notifyChannels.length > 0) {
      await sendNotification(response, notifyChannels);
    }

    // 6. 失敗時のエスカレーション
    if (autoEscalate && overallStatus === "failed") {
      log.info("Auto-escalating failed repair");
      try {
        await executeEscalate({
          action: "escalate_to_human",
          target: "github_issue",
          params: {
            issue: "自動修繕が失敗しました",
            rootCause: executed
              .filter((e) => e.status === "failed")
              .map((e) => e.error)
              .join("\n"),
          },
          order: 999,
          rollbackable: false,
        });
      } catch (error) {
        if (error instanceof ManualInterventionRequiredError) {
          log.warn("Auto escalation requires manual intervention", {
            error: error.message,
          });
        } else {
          throw error;
        }
      }
    }

    log.info("Intelligent repair completed", {
      overallStatus,
      successCount,
      failedCount,
    });

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    // リクエストIDを生成（ログ照合用）
    const requestId = crypto.randomUUID();

    log.error("Intelligent repair failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // クライアントには内部エラー詳細を漏洩しない
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        requestId, // ログ照合用に返却
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
