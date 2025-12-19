/**
 * Manus AI API 共有モジュール
 * 監査エラー時の自動修繕タスクを作成
 *
 * @see https://open.manus.ai/docs/api-reference/create-task
 */
import { createLogger } from "./logger.ts";

const log = createLogger("manus-api");

const MANUS_API_KEY = Deno.env.get("MANUS_API_KEY") ?? "";
const MANUS_BASE_URL = Deno.env.get("MANUS_BASE_URL") ?? "https://api.manus.ai";

type AgentProfile = "manus-1.6" | "manus-1.6-lite" | "manus-1.6-max";

interface CreateTaskRequest {
  prompt: string;
  agentProfile?: AgentProfile;
  taskMode?: "chat" | "adaptive" | "agent";
  locale?: string;
  hideInTaskList?: boolean;
  createShareableLink?: boolean;
}

interface CreateTaskResponse {
  task_id: string;
  task_title: string;
  task_url: string;
  share_url?: string;
}

interface ManusError {
  error: string;
  message: string;
}

/**
 * Manus AIでタスクを作成
 */
export async function createManusTask(
  request: CreateTaskRequest
): Promise<{ success: true; data: CreateTaskResponse } | { success: false; error: string }> {
  if (!MANUS_API_KEY) {
    log.warn("MANUS_API_KEY not configured, skipping Manus task creation");
    return { success: false, error: "MANUS_API_KEY not configured" };
  }

  const endpoint = `${MANUS_BASE_URL}/v1/tasks`;

  try {
    log.info("Creating Manus task", {
      promptLength: request.prompt.length,
      agentProfile: request.agentProfile ?? "manus-1.6",
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API_KEY": MANUS_API_KEY,
      },
      body: JSON.stringify({
        prompt: request.prompt,
        agentProfile: request.agentProfile ?? "manus-1.6",
        taskMode: request.taskMode ?? "agent",
        locale: request.locale ?? "ja",
        hideInTaskList: request.hideInTaskList ?? false,
        createShareableLink: request.createShareableLink ?? true,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log.error("Manus API error", {
        status: response.status,
        errorBody,
      });
      return {
        success: false,
        error: `Manus API error ${response.status}: ${errorBody}`,
      };
    }

    const data = await response.json() as CreateTaskResponse;
    log.info("Manus task created", {
      taskId: data.task_id,
      taskUrl: data.task_url,
    });

    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Failed to create Manus task", { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * 監査エラーから自動修繕タスクのプロンプトを生成
 */
export function buildRemediationPrompt(auditResult: {
  checks: {
    cardInventory: { passed: boolean; warnings: string[]; details?: unknown[] };
    broadcastSuccess: { passed: boolean; warnings: string[] };
    databaseHealth?: { passed: boolean; warnings: string[] };
  };
  summary: { warningCount: number; errorCount: number };
}): string {
  const issues: string[] = [];

  // カード在庫問題
  if (!auditResult.checks.cardInventory.passed) {
    issues.push(`【カード在庫問題】\n${auditResult.checks.cardInventory.warnings.join("\n")}`);
  }

  // 配信成功率問題
  if (!auditResult.checks.broadcastSuccess.passed) {
    issues.push(`【配信成功率問題】\n${auditResult.checks.broadcastSuccess.warnings.join("\n")}`);
  }

  // DB健全性問題
  if (auditResult.checks.databaseHealth && !auditResult.checks.databaseHealth.passed) {
    issues.push(`【データベース健全性問題】\n${auditResult.checks.databaseHealth.warnings.join("\n")}`);
  }

  const prompt = `
# LINE Daily Brief システム監査で問題が検出されました

以下の問題を分析し、修繕してください。

## 検出された問題

${issues.join("\n\n")}

## 修繕方法

1. **カード在庫不足の場合**:
   - GitHubリポジトリ: mo666-med/cursorvers_line_free_dev
   - Supabase line_cards テーブルに新規カードを追加
   - テーマ別に50枚以上を維持

2. **配信失敗の場合**:
   - Supabase Edge Function のログを確認
   - LINE Messaging API のエラーを調査
   - 必要に応じてGitHub Issueを作成

3. **データベース異常の場合**:
   - 重複コンテンツをアーカイブ
   - 異常なレコードを調査

## 完了後

修繕結果をDiscord webhookに報告してください:
- 修繕した項目
- 残りの問題（あれば）

警告数: ${auditResult.summary.warningCount}
エラー数: ${auditResult.summary.errorCount}
`.trim();

  return prompt;
}

/**
 * 監査エラー時にManusで自動修繕タスクを作成
 */
export async function triggerAutoRemediation(auditResult: Parameters<typeof buildRemediationPrompt>[0]): Promise<{
  success: boolean;
  taskId?: string;
  taskUrl?: string;
  error?: string;
}> {
  const prompt = buildRemediationPrompt(auditResult);

  const result = await createManusTask({
    prompt,
    agentProfile: "manus-1.6",
    taskMode: "agent",
  });

  if (result.success) {
    return {
      success: true,
      taskId: result.data.task_id,
      taskUrl: result.data.task_url,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}
