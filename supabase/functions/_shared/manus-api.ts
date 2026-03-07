/**
 * Manus AI API 共有モジュール
 * 監査エラー時の自動修繕タスクを作成
 *
 * @see https://open.manus.ai/docs/api-reference/create-task
 */
import { createLogger } from "./logger.ts";
import { isRetryableError, isRetryableStatus, withRetry } from "./retry.ts";

const log = createLogger("manus-api");

const MANUS_API_KEY = Deno.env.get("MANUS_API_KEY") ?? "";
const MANUS_BASE_URL = Deno.env.get("MANUS_BASE_URL") ?? "https://api.manus.ai";

// プロンプトインジェクション対策: 最大文字数
const MAX_WARNING_LENGTH = 500;
const MAX_TOTAL_WARNINGS = 20;

// リトライ設定
const MAX_RETRIES = 3;

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
    .replace(
      /disregard\s+(all\s+)?prior\s+(instructions?|context)/gi,
      "[REMOVED]",
    )
    .replace(/forget\s+(everything|all|previous)/gi, "[REMOVED]")
    .replace(/override\s+(instructions?|rules?|constraints?)/gi, "[REMOVED]")
    .replace(/system\s*:\s*/gi, "system: ") // "system:" パターンを無害化
    .replace(/```[\s\S]*?```/g, "[CODE BLOCK REMOVED]") // コードブロックを除去
    // 制御文字を除去（意図的な使用のためlint除外）
    // deno-lint-ignore no-control-regex
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
    .slice(0, MAX_TOTAL_WARNINGS) // 最大数制限
    .map(sanitizeForPrompt)
    .filter((w) => w.length > 0); // 空文字を除去
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
 * Manus AIでタスクを作成（指数バックオフ付きリトライ対応）
 */
export async function createManusTask(
  request: CreateTaskRequest,
): Promise<
  { success: true; data: CreateTaskResponse } | {
    success: false;
    error: string;
  }
> {
  if (!MANUS_API_KEY) {
    log.warn("MANUS_API_KEY not configured, skipping Manus task creation");
    return { success: false, error: "MANUS_API_KEY not configured" };
  }

  const endpoint = `${MANUS_BASE_URL}/v1/tasks`;

  log.info("Creating Manus task", {
    promptLength: request.prompt.length,
    agentProfile: request.agentProfile ?? "manus-1.6",
  });

  try {
    const data = await withRetry(
      async () => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${MANUS_API_KEY}`,
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

          // リトライ可能なステータスコードの場合はエラーをスロー
          if (isRetryableStatus(response.status)) {
            const retryError = new Error(
              `Manus API error ${response.status}: ${errorBody}`,
            );
            (retryError as Error & { status: number }).status = response.status;
            throw retryError;
          }

          // リトライ不可能なエラー（4xx系）は即座に失敗として返す
          log.error("Manus API error (non-retryable)", {
            status: response.status,
            errorBody,
          });
          throw new Error(`NON_RETRYABLE:${response.status}:${errorBody}`);
        }

        return await response.json() as CreateTaskResponse;
      },
      {
        maxRetries: MAX_RETRIES,
        shouldRetry: (error) => {
          // NON_RETRYABLE プレフィックスがある場合はリトライしない
          if (
            error instanceof Error && error.message.startsWith("NON_RETRYABLE:")
          ) {
            return false;
          }
          return isRetryableError(error);
        },
        onRetry: (attempt, error, nextDelay) => {
          log.warn("Manus API request failed, retrying", {
            attempt,
            error: error instanceof Error ? error.message : String(error),
            nextDelayMs: nextDelay,
          });
        },
      },
    );

    log.info("Manus task created", {
      taskId: data.task_id,
      taskUrl: data.task_url,
    });

    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // NON_RETRYABLE プレフィックスを除去
    const cleanedMessage = errorMessage.replace(/^NON_RETRYABLE:/, "");

    log.error("Failed to create Manus task after retries", {
      error: cleanedMessage,
      maxRetries: MAX_RETRIES,
    });
    return { success: false, error: cleanedMessage };
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
    lineRegistrationSystem?: { passed: boolean; warnings: string[] };
  };
  summary: { warningCount: number; errorCount: number };
}): string {
  const issues: string[] = [];

  // カード在庫問題（警告メッセージをサニタイズ）
  if (!auditResult.checks.cardInventory.passed) {
    const sanitizedWarnings = sanitizeWarnings(
      auditResult.checks.cardInventory.warnings,
    );
    if (sanitizedWarnings.length > 0) {
      issues.push(`【カード在庫問題】\n${sanitizedWarnings.join("\n")}`);
    }
  }

  // 配信成功率問題（警告メッセージをサニタイズ）
  if (!auditResult.checks.broadcastSuccess.passed) {
    const sanitizedWarnings = sanitizeWarnings(
      auditResult.checks.broadcastSuccess.warnings,
    );
    if (sanitizedWarnings.length > 0) {
      issues.push(`【配信成功率問題】\n${sanitizedWarnings.join("\n")}`);
    }
  }

  // DB健全性問題（警告メッセージをサニタイズ）
  if (
    auditResult.checks.databaseHealth &&
    !auditResult.checks.databaseHealth.passed
  ) {
    const sanitizedWarnings = sanitizeWarnings(
      auditResult.checks.databaseHealth.warnings,
    );
    if (sanitizedWarnings.length > 0) {
      issues.push(
        `【データベース健全性問題】\n${sanitizedWarnings.join("\n")}`,
      );
    }
  }

  // LINE登録システム問題（Webhook、API、ランディングページ）
  if (
    auditResult.checks.lineRegistrationSystem &&
    !auditResult.checks.lineRegistrationSystem.passed
  ) {
    const sanitizedWarnings = sanitizeWarnings(
      auditResult.checks.lineRegistrationSystem.warnings,
    );
    if (sanitizedWarnings.length > 0) {
      issues.push(
        `【LINE登録システム問題】\n${sanitizedWarnings.join("\n")}`,
      );
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

### 3. LINE Webhook/登録システムの修繕
\`\`\`bash
# LINE Webhookの疎通確認
curl -s "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-webhook"
# 期待: "OK - line-webhook is running"

# 401エラーの場合: LINE_CHANNEL_SECRETを再設定
# LINE Developersコンソール(https://developers.line.biz/)でChannel secretを確認
npx supabase secrets set LINE_CHANNEL_SECRET="<Channel secret>" --project-ref haaxgwyimoqzzxzdaeep

# JWT検証エラーの場合: --no-verify-jwtで再デプロイ
npx supabase functions deploy line-webhook --no-verify-jwt --project-ref haaxgwyimoqzzxzdaeep

# LINE登録APIの確認
curl -s "https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-register" \\
  -X POST -H "Content-Type: application/json" \\
  -d '{"email":"test@example.com","opt_in_email":false}'
\`\`\`

### 4. GitHub Issueを作成（重大な問題の場合）
\`\`\`bash
gh issue create --repo mo666-med/cursorvers_line_free_dev \\
  --title "🚨 自動検出: システム監査エラー" \\
  --body "## 検出された問題\\n${
    issues.join("\\n")
  }\\n\\n## 自動修繕結果\\n（ここに結果を記載）"
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
 * 監査エラー時にManusで自動修繕タスクを作成（レガシー）
 * @deprecated triggerIntelligentRepairを使用してください
 */
export async function triggerAutoRemediation(
  auditResult: Parameters<typeof buildRemediationPrompt>[0],
): Promise<{
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

// ============================================================
// Manus Intelligent Repair - AI判断と自動修繕
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

interface IntelligentRepairOptions {
  dryRun?: boolean | undefined;
  autoEscalate?: boolean | undefined;
  notify?: string[] | undefined;
}

interface IntelligentRepairResult {
  success: boolean;
  diagnosis?: {
    issues: Array<{
      type: string;
      description: string;
      rootCause: string;
      priority: number;
    }>;
    severity: string;
    confidence: number;
  };
  summary?: {
    totalSteps: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    overallStatus: "success" | "partial" | "failed" | "dry_run";
  };
  error?: string | undefined;
}

/**
 * Manus Intelligent Repairを呼び出してAI判断・自動修繕を実行
 *
 * 従来のtriggerAutoRemediationと異なり、
 * - ローカルでAI診断を実行
 * - 修繕計画を自動作成
 * - 修繕を自動実行
 * - 結果を検証してレポート
 */
export async function triggerIntelligentRepair(
  auditResult: Parameters<typeof buildRemediationPrompt>[0],
  options: IntelligentRepairOptions = {},
): Promise<IntelligentRepairResult> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    log.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    return { success: false, error: "Environment not configured" };
  }

  const endpoint = `${SUPABASE_URL}/functions/v1/manus-intelligent-repair`;

  log.info("Triggering intelligent repair", {
    dryRun: options.dryRun ?? false,
    issueCount: [
      !auditResult.checks.cardInventory.passed,
      !auditResult.checks.broadcastSuccess.passed,
      auditResult.checks.databaseHealth &&
      !auditResult.checks.databaseHealth.passed,
      auditResult.checks.lineRegistrationSystem &&
      !auditResult.checks.lineRegistrationSystem.passed,
    ].filter(Boolean).length,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        audit_result: auditResult,
        trigger: "scheduled",
        options: {
          dry_run: options.dryRun ?? false,
          auto_escalate: options.autoEscalate ?? true,
          notify: options.notify ?? ["discord"],
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log.error("Intelligent repair API error", {
        status: response.status,
        body: errorBody,
      });
      return {
        success: false,
        error: `API error: ${response.status} - ${errorBody}`,
      };
    }

    const data = await response.json();

    log.info("Intelligent repair completed", {
      overallStatus: data.summary?.overallStatus,
      successCount: data.summary?.successCount,
      failedCount: data.summary?.failedCount,
    });

    return {
      success: data.summary?.overallStatus !== "failed",
      diagnosis: data.diagnosis,
      summary: data.summary,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Intelligent repair request failed", { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

// ============================================================
// Manus AI Diagnosis - LLMによる高度な診断
// ============================================================

const MANUS_AI_DIAGNOSIS_TIMEOUT = 30000; // 30秒

interface ManusAIDiagnosisResult {
  success: boolean;
  diagnosis?: {
    issues: Array<{
      type: string;
      description: string;
      rootCause: string;
      suggestedActions: string[];
      priority: number;
    }>;
    severity: "critical" | "high" | "medium" | "low";
    confidence: number;
    reasoning: string;
  } | undefined;
  fallbackUsed: boolean;
  error?: string | undefined;
}

/**
 * Manus AIを使って監査結果を診断
 *
 * フェイルセーフ:
 * - API障害時 → ルールベース診断にフォールバック
 * - タイムアウト → ルールベース診断にフォールバック
 * - 不正レスポンス → ルールベース診断にフォールバック
 */
export async function diagnoseWithManusAI(
  auditResult: Parameters<typeof buildRemediationPrompt>[0],
  fallbackDiagnosis: ManusAIDiagnosisResult["diagnosis"],
): Promise<ManusAIDiagnosisResult> {
  if (!MANUS_API_KEY) {
    log.warn("MANUS_API_KEY not configured, using fallback diagnosis");
    return {
      success: true,
      diagnosis: fallbackDiagnosis,
      fallbackUsed: true,
    };
  }

  const diagnosisPrompt = buildDiagnosisPrompt(auditResult);

  log.info("Requesting Manus AI diagnosis", {
    promptLength: diagnosisPrompt.length,
  });

  try {
    // タイムアウト付きでManus APIを呼び出し
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      MANUS_AI_DIAGNOSIS_TIMEOUT,
    );

    const endpoint = `${MANUS_BASE_URL}/v1/tasks`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MANUS_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: diagnosisPrompt,
        agentProfile: "manus-1.6-lite", // 高速なモデルを使用
        taskMode: "chat", // 対話モードで即座に回答
        locale: "ja",
        hideInTaskList: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      log.warn("Manus AI diagnosis failed, using fallback", {
        status: response.status,
      });
      return {
        success: true,
        diagnosis: fallbackDiagnosis,
        fallbackUsed: true,
        error: `API error: ${response.status}`,
      };
    }

    const data = await response.json();

    // レスポンスの検証
    if (!data || !data.task_id) {
      log.warn("Invalid Manus AI response, using fallback");
      return {
        success: true,
        diagnosis: fallbackDiagnosis,
        fallbackUsed: true,
        error: "Invalid response format",
      };
    }

    // 注: Manus APIはタスクを作成するだけで、即座に結果を返さない
    // 本番運用では、タスク完了を待つか、Webhookで結果を受け取る必要がある
    // 現在はフォールバック診断を使用
    log.info("Manus AI task created, using fallback for immediate response", {
      taskId: data.task_id,
    });

    return {
      success: true,
      diagnosis: fallbackDiagnosis,
      fallbackUsed: true, // 実際にはタスク作成のみ
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (error instanceof Error && error.name === "AbortError") {
      log.warn("Manus AI diagnosis timeout, using fallback");
      return {
        success: true,
        diagnosis: fallbackDiagnosis,
        fallbackUsed: true,
        error: "Timeout",
      };
    }

    log.warn("Manus AI diagnosis error, using fallback", {
      error: errorMessage,
    });

    return {
      success: true,
      diagnosis: fallbackDiagnosis,
      fallbackUsed: true,
      error: errorMessage,
    };
  }
}

/**
 * AI診断用のプロンプトを構築
 */
function buildDiagnosisPrompt(
  auditResult: Parameters<typeof buildRemediationPrompt>[0],
): string {
  const sanitizedWarnings = {
    cardInventory: sanitizeWarnings(auditResult.checks.cardInventory.warnings),
    broadcastSuccess: sanitizeWarnings(
      auditResult.checks.broadcastSuccess.warnings,
    ),
    databaseHealth: auditResult.checks.databaseHealth
      ? sanitizeWarnings(auditResult.checks.databaseHealth.warnings)
      : [],
    lineRegistrationSystem: auditResult.checks.lineRegistrationSystem
      ? sanitizeWarnings(auditResult.checks.lineRegistrationSystem.warnings)
      : [],
  };

  return `
# LINE Daily Brief システム監査結果の診断

以下の監査結果を分析し、問題の根本原因と推奨アクションをJSON形式で返してください。

## 監査結果

### カード在庫チェック
- 結果: ${auditResult.checks.cardInventory.passed ? "OK" : "NG"}
- 警告: ${sanitizedWarnings.cardInventory.join(", ") || "なし"}

### 配信成功率チェック
- 結果: ${auditResult.checks.broadcastSuccess.passed ? "OK" : "NG"}
- 警告: ${sanitizedWarnings.broadcastSuccess.join(", ") || "なし"}

### データベース健全性チェック
- 結果: ${auditResult.checks.databaseHealth?.passed ?? "未実施"}
- 警告: ${sanitizedWarnings.databaseHealth.join(", ") || "なし"}

### LINE登録システムチェック
- 結果: ${auditResult.checks.lineRegistrationSystem?.passed ?? "未実施"}
- 警告: ${sanitizedWarnings.lineRegistrationSystem.join(", ") || "なし"}

## 出力フォーマット

以下のJSON形式で回答してください:

\`\`\`json
{
  "issues": [
    {
      "type": "card_inventory_low | broadcast_failure | database_anomaly | line_webhook_error",
      "description": "問題の説明",
      "rootCause": "根本原因の分析",
      "suggestedActions": ["アクション1", "アクション2"],
      "priority": 1-10
    }
  ],
  "severity": "critical | high | medium | low",
  "confidence": 0-100,
  "reasoning": "診断の根拠"
}
\`\`\`
`.trim();
}
