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

// プロンプトインジェクション対策: 最大文字数
const MAX_WARNING_LENGTH = 500;
const MAX_TOTAL_WARNINGS = 20;

/**
 * セキュリティ: ユーザー入力/DB値をプロンプトに含める前にサニタイズ
 * - 長さを制限
 * - 危険なパターンを除去
 * - 特殊文字をエスケープ
 */
function sanitizeForPrompt(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  let sanitized = input
    // 長さ制限
    .slice(0, MAX_WARNING_LENGTH)
    // プロンプトインジェクションで使われそうなパターンを除去
    .replace(/ignore\s+(all\s+)?previous\s+instructions?/gi, "[REMOVED]")
    .replace(/disregard\s+(all\s+)?prior\s+(instructions?|context)/gi, "[REMOVED]")
    .replace(/forget\s+(everything|all|previous)/gi, "[REMOVED]")
    .replace(/override\s+(instructions?|rules?|constraints?)/gi, "[REMOVED]")
    .replace(/system\s*:\s*/gi, "system: ")  // "system:" パターンを無害化
    .replace(/```[\s\S]*?```/g, "[CODE BLOCK REMOVED]")  // コードブロックを除去
    // 制御文字を除去
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // 連続する空白を正規化
    .replace(/\s+/g, " ")
    .trim();

  // 長さ超過の場合は末尾を示す
  if (input.length > MAX_WARNING_LENGTH) {
    sanitized += "...[truncated]";
  }

  return sanitized;
}

/**
 * 警告メッセージ配列をサニタイズ
 */
function sanitizeWarnings(warnings: string[]): string[] {
  if (!Array.isArray(warnings)) {
    return [];
  }

  return warnings
    .slice(0, MAX_TOTAL_WARNINGS)  // 最大数制限
    .map(sanitizeForPrompt)
    .filter(w => w.length > 0);  // 空文字を除去
}

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

  // カード在庫問題（警告メッセージをサニタイズ）
  if (!auditResult.checks.cardInventory.passed) {
    const sanitizedWarnings = sanitizeWarnings(auditResult.checks.cardInventory.warnings);
    if (sanitizedWarnings.length > 0) {
      issues.push(`【カード在庫問題】\n${sanitizedWarnings.join("\n")}`);
    }
  }

  // 配信成功率問題（警告メッセージをサニタイズ）
  if (!auditResult.checks.broadcastSuccess.passed) {
    const sanitizedWarnings = sanitizeWarnings(auditResult.checks.broadcastSuccess.warnings);
    if (sanitizedWarnings.length > 0) {
      issues.push(`【配信成功率問題】\n${sanitizedWarnings.join("\n")}`);
    }
  }

  // DB健全性問題（警告メッセージをサニタイズ）
  if (auditResult.checks.databaseHealth && !auditResult.checks.databaseHealth.passed) {
    const sanitizedWarnings = sanitizeWarnings(auditResult.checks.databaseHealth.warnings);
    if (sanitizedWarnings.length > 0) {
      issues.push(`【データベース健全性問題】\n${sanitizedWarnings.join("\n")}`);
    }
  }

  const prompt = `
# 🚨 LINE Daily Brief システム監査エラー - 自動修繕を実行してください

## 検出された問題

${issues.join("\n\n")}

## 🔧 修繕手順（必ず実行してください）

### 環境情報
- GitHubリポジトリ: https://github.com/mo666-med/cursorvers_line_free_dev
- Supabase Project: haaxgwyimoqzzxzdaeep
- Supabase URL: https://haaxgwyimoqzzxzdaeep.supabase.co

### 1. カード在庫不足の修繕
\`\`\`bash
# GitHub CLIでリポジトリをクローン
gh repo clone mo666-med/cursorvers_line_free_dev
cd cursorvers_line_free_dev

# カード生成スクリプトを実行（存在する場合）
node scripts/generate-cards.js --theme <不足テーマ> --count 50

# または直接Supabase SQLを実行
# INSERT INTO line_cards (theme, content, status) VALUES ...
\`\`\`

### 2. 配信失敗の修繕
\`\`\`bash
# Supabase Edge Functionのログを確認
npx supabase functions logs line-daily-brief --project-ref haaxgwyimoqzzxzdaeep

# 必要に応じてEdge Functionを再デプロイ
npx supabase functions deploy line-daily-brief --project-ref haaxgwyimoqzzxzdaeep
\`\`\`

### 3. GitHub Issueを作成（重大な問題の場合）
\`\`\`bash
gh issue create --repo mo666-med/cursorvers_line_free_dev \\
  --title "🚨 自動検出: システム監査エラー" \\
  --body "## 検出された問題\\n${issues.join("\\n")}\\n\\n## 自動修繕結果\\n（ここに結果を記載）"
\`\`\`

## ✅ 完了後の報告

修繕完了後、以下のDiscord Webhookに結果を報告してください:

\`\`\`bash
curl -X POST "https://discord.com/api/webhooks/..." \\
  -H "Content-Type: application/json" \\
  -d '{"content": "✅ 自動修繕完了\\n修繕項目: ...\\n結果: 成功"}'
\`\`\`

## 📊 問題サマリー
- 警告数: ${auditResult.summary.warningCount}
- エラー数: ${auditResult.summary.errorCount}

**重要**: このタスクは自動化されています。可能な限り人間の介入なしで修繕を完了してください。
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
