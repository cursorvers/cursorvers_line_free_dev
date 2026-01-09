/**
 * Manus Code Fixer
 *
 * Automated code fixes for format and lint issues.
 * Called by GitHub Actions when lint/format checks fail.
 *
 * Features:
 * - Trigger GitHub Actions for `deno fmt` / `deno lint --fix`
 * - Report results to Discord
 * - Escalate unfixable issues to GitHub Issues
 *
 * POST /manus-code-fixer
 * Headers:
 *   - X-API-Key: API key for GitHub Actions authentication
 *
 * Body:
 * {
 *   "repository": "cursorvers_line_stripe_discord",
 *   "branch": "main",
 *   "path": "supabase/functions/line-webhook",
 *   "failures": [
 *     { "type": "format", "files": ["index.ts", "lib/diagnosis-flow.ts"] },
 *     { "type": "lint", "files": ["lib/risk-checker.ts"] }
 *   ]
 * }
 */

type FailureType = "format" | "lint" | "test" | "security" | "build";

interface FixRequest {
  repository: string;
  branch: string;
  path: string;
  commitSha?: string;
  failures: Array<{
    type: FailureType;
    files?: string[];
    details?: string;
  }>;
}

interface FixResult {
  ok: boolean;
  fixed: FixedItem[];
  skipped: SkippedItem[];
  errors: ErrorItem[];
  summary: {
    fixedCount: number;
    skippedCount: number;
    errorCount: number;
  };
}

interface FixedItem {
  type: FailureType;
  files: string[];
  details: string;
}

interface SkippedItem {
  type: FailureType;
  reason: string;
}

interface ErrorItem {
  type: FailureType;
  error: string;
}

const REQUIRED_ENV_VARS = ["MANUS_FIXER_API_KEY"] as const;

const getEnv = (name: (typeof REQUIRED_ENV_VARS)[number]): string => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

import { createLogger } from "../_shared/logger.ts";

const MANUS_FIXER_API_KEY = getEnv("MANUS_FIXER_API_KEY");
const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_MANUS_WEBHOOK_URL") ??
  Deno.env.get("DISCORD_WEBHOOK_URL") ??
  Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL") ??
  Deno.env.get("DISCORD_SYSTEM_WEBHOOK");
const GITHUB_TOKEN = Deno.env.get("MANUS_GITHUB_TOKEN") ??
  Deno.env.get("GITHUB_TOKEN");
const GITHUB_API_BASE = Deno.env.get("GITHUB_API_BASE") ??
  "https://api.github.com";
const CODE_FIXER_WORKFLOW = Deno.env.get("MANUS_CODE_FIXER_WORKFLOW") ??
  "manus-code-fixer.yml";

const log = createLogger("manus-code-fixer");

function verifyAuth(req: Request): boolean {
  const apiKeyHeader = req.headers.get("X-API-Key");
  if (apiKeyHeader === MANUS_FIXER_API_KEY) {
    log.info("Authentication successful");
    return true;
  }

  log.warn("Authentication failed");
  return false;
}

const FIXABLE_TYPES: FailureType[] = ["format", "lint"];

interface RepoInfo {
  owner: string;
  name: string;
}

interface DispatchResult {
  ok: boolean;
  error?: string;
}

interface IssueResult {
  ok: boolean;
  url?: string;
  error?: string;
}

function parseRepository(repository: string): RepoInfo {
  const [owner, name] = repository.split("/");
  if (!owner || !name) {
    throw new Error(
      "Invalid repository format. Expected 'owner/repo'.",
    );
  }
  return { owner, name };
}

async function dispatchFixWorkflow(
  repo: RepoInfo,
  request: FixRequest,
  fixTypes: FailureType[],
  files: string[],
): Promise<DispatchResult> {
  if (!GITHUB_TOKEN) {
    return { ok: false, error: "MANUS_GITHUB_TOKEN not configured" };
  }

  const inputs: Record<string, string> = {
    fix_types: fixTypes.join(","),
    path: request.path ?? "",
  };

  if (files.length > 0) {
    inputs["files"] = files.join(",");
  }

  if (request.commitSha) {
    inputs["commit_sha"] = request.commitSha;
  }

  const endpoint =
    `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/actions/workflows/${CODE_FIXER_WORKFLOW}/dispatches`;

  log.info("Dispatching code fixer workflow", {
    repository: request.repository,
    branch: request.branch,
    fixTypes,
    fileCount: files.length,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
      ref: request.branch,
      inputs,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return {
      ok: false,
      error: `Workflow dispatch failed (${response.status}): ${errorBody}`,
    };
  }

  return { ok: true };
}

async function createManualIssue(
  repo: RepoInfo,
  request: FixRequest,
  failures: FixRequest["failures"],
): Promise<IssueResult> {
  if (!GITHUB_TOKEN) {
    return { ok: false, error: "MANUS_GITHUB_TOKEN not configured" };
  }

  const endpoint = `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/issues`;
  const types = failures.map((failure) => failure.type).join(", ");

  const failureDetails = failures
    .map((failure) => {
      const files = failure.files?.length
        ? `files: ${failure.files.join(", ")}`
        : "files: (not provided)";
      const details = failure.details ? `details: ${failure.details}` : "";
      return `- ${failure.type} (${files}) ${details}`.trim();
    })
    .join("\n");

  const body = [
    "## Manus Code Fixer escalation",
    "",
    `- Repository: ${request.repository}`,
    `- Branch: ${request.branch}`,
    request.commitSha ? `- Commit: ${request.commitSha}` : null,
    `- Path: ${request.path}`,
    "",
    "### Failures",
    failureDetails,
    "",
    "### Recommended action",
    "Manual investigation required (tests/security/build).",
  ]
    .filter((line) => line)
    .join("\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
      title: `Manus Code Fixer: manual review required (${types})`,
      body,
      labels: ["manus", "auto-fix", "needs-manual"],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return {
      ok: false,
      error: `Issue creation failed (${response.status}): ${errorBody}`,
    };
  }

  const data = await response.json() as { html_url?: string };
  const issueUrl = data.html_url;
  return issueUrl ? { ok: true, url: issueUrl } : { ok: true };
}

async function processFixes(request: FixRequest): Promise<FixResult> {
  const result: FixResult = {
    ok: true,
    fixed: [],
    skipped: [],
    errors: [],
    summary: {
      fixedCount: 0,
      skippedCount: 0,
      errorCount: 0,
    },
  };

  let repo: RepoInfo | null = null;
  try {
    repo = parseRepository(request.repository);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push({ type: "build", error: errorMessage });
    result.summary.errorCount++;
    result.ok = false;
    return result;
  }

  const fixableFailures = request.failures.filter((failure) =>
    FIXABLE_TYPES.includes(failure.type)
  );
  const manualFailures = request.failures.filter((failure) =>
    !FIXABLE_TYPES.includes(failure.type)
  );

  if (fixableFailures.length > 0) {
    const fixTypes = Array.from(
      new Set(fixableFailures.map((failure) => failure.type)),
    );
    const files = fixableFailures.flatMap((failure) => failure.files ?? []);

    const dispatchResult = await dispatchFixWorkflow(
      repo,
      request,
      fixTypes,
      files,
    );

    if (dispatchResult.ok) {
      for (const fixType of fixTypes) {
        const fixFiles = fixableFailures
          .filter((failure) => failure.type === fixType)
          .flatMap((failure) => failure.files ?? []);
        result.fixed.push({
          type: fixType,
          files: fixFiles,
          details: "Workflow dispatched for auto-fix",
        });
        result.summary.fixedCount++;
      }
    } else {
      for (const fixType of fixTypes) {
        result.errors.push({
          type: fixType,
          error: dispatchResult.error ?? "Workflow dispatch failed",
        });
        result.summary.errorCount++;
      }
      result.ok = false;
    }
  }

  if (manualFailures.length > 0) {
    const issueResult = await createManualIssue(repo, request, manualFailures);

    for (const failure of manualFailures) {
      if (issueResult.ok) {
        result.skipped.push({
          type: failure.type,
          reason: `Manual review required. Issue: ${issueResult.url ?? ""}`
            .trim(),
        });
        result.summary.skippedCount++;
      } else {
        result.errors.push({
          type: failure.type,
          error: issueResult.error ?? "Issue creation failed",
        });
        result.summary.errorCount++;
        result.ok = false;
      }
    }
  }

  return result;
}

async function sendDiscordNotification(
  request: FixRequest,
  result: FixResult,
): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) {
    log.warn("Discord webhook URL not configured, skipping notification");
    return;
  }

  const emoji = result.ok ? "✅" : "⚠️";
  const statusText = result.ok ? "自動修正完了" : "一部修正失敗";

  let message = `${emoji} **Manus Code Fixer** - ${statusText}\n`;
  message += `リポジトリ: ${request.repository}\n`;
  message += `ブランチ: ${request.branch}\n`;
  message += `パス: ${request.path}\n\n`;

  message += `**サマリー**\n`;
  message += `- 修正完了: ${result.summary.fixedCount}件\n`;
  message += `- スキップ: ${result.summary.skippedCount}件\n`;
  message += `- エラー: ${result.summary.errorCount}件\n\n`;

  if (result.fixed.length > 0) {
    message += `**修正内容**\n`;
    for (const fix of result.fixed) {
      message += `- ${fix.type}: ${fix.files.length}ファイル\n`;
    }
    message += "\n";
  }

  if (result.skipped.length > 0) {
    message += `**スキップ項目**\n`;
    for (const skip of result.skipped) {
      message += `- ${skip.type}: ${skip.reason}\n`;
    }
    message += "\n";
  }

  if (result.errors.length > 0) {
    message += `**エラー**\n`;
    for (const error of result.errors) {
      message += `- ${error.type}: ${error.error}\n`;
    }
  }

  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message.trim() }),
    });
    log.info("Discord notification sent");
  } catch (error) {
    log.error("Failed to send Discord notification", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!verifyAuth(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const request = await req.json() as FixRequest;

    log.info("Processing fix request", {
      repository: request.repository,
      branch: request.branch,
      failureCount: request.failures.length,
    });

    const result = await processFixes(request);

    // Send Discord notification
    await sendDiscordNotification(request, result);

    log.info("Fix request completed", {
      ok: result.ok,
      fixedCount: result.summary.fixedCount,
      skippedCount: result.summary.skippedCount,
      errorCount: result.summary.errorCount,
    });

    return new Response(
      JSON.stringify(result),
      {
        status: result.ok ? 200 : 207, // 207 Multi-Status for partial success
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    log.error("Fix request failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
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
      },
    );
  }
});
