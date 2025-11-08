/**
 * Minimal Manus API client shared between CLI usage, MCP servers,
 * and GitHub Actions workflows.
 */

const DEFAULT_BASE_URL = "https://api.manus.ai";
const USER_AGENT = "cursorvers-line-free-dev/1.0.0";

function trim(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveConfig(overrides = {}, env = process.env) {
  const apiKey = trim(overrides.apiKey ?? env.MANUS_API_KEY);
  const baseUrl = trim(overrides.baseUrl ?? env.MANUS_BASE_URL) || DEFAULT_BASE_URL;
  const webhookUrl = trim(overrides.webhookUrl ?? env.PROGRESS_WEBHOOK_URL);

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    webhookUrl: webhookUrl || null,
    userAgent: overrides.userAgent ?? USER_AGENT,
  };
}

export function buildPrompt({ brief, plan }) {
  if (!brief || typeof brief !== "string") {
    throw new Error("Brief text is required to build Manus prompt");
  }

  let planJson;
  if (plan && typeof plan === "string") {
    planJson = plan.trim();
  } else if (plan && typeof plan === "object") {
    planJson = JSON.stringify(plan, null, 2);
  } else {
    throw new Error("Plan JSON (object or string) is required to build Manus prompt");
  }

  return `${brief.trim()}\n\nPlan JSON:\n${planJson}`;
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

export async function requestManus({ apiKey, baseUrl, path, method, body, userAgent }) {
  if (!apiKey) {
    throw new Error("MANUS_API_KEY is not configured");
  }

  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      API_KEY: apiKey,
      "User-Agent": userAgent,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`Manus API ${method} ${path} failed (${response.status}): ${message}`);
  }

  return data;
}

export async function createManusTask({ brief, plan, webhookUrl, metadata, overrides = {} } = {}) {
  const config = resolveConfig(overrides);
  const prompt = buildPrompt({ brief, plan });

  const payload = {
    prompt,
  };
  if (webhookUrl ?? config.webhookUrl) {
    payload.webhook_url = webhookUrl ?? config.webhookUrl;
  }
  if (metadata && Object.keys(metadata).length > 0) {
    payload.metadata = metadata;
  }

  return await requestManus({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    path: "/v1/tasks",
    method: "POST",
    body: payload,
    userAgent: config.userAgent,
  });
}

export async function getManusTask(taskId, overrides = {}) {
  if (!taskId) {
    throw new Error("Task ID is required to fetch Manus task");
  }

  const config = resolveConfig(overrides);
  return await requestManus({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    path: `/v1/tasks/${encodeURIComponent(taskId)}`,
    method: "GET",
    userAgent: config.userAgent,
  });
}

export async function cancelManusTask(taskId, overrides = {}) {
  if (!taskId) {
    throw new Error("Task ID is required to cancel Manus task");
  }

  const config = resolveConfig(overrides);
  return await requestManus({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    path: `/v1/tasks/${encodeURIComponent(taskId)}`,
    method: "DELETE",
    userAgent: config.userAgent,
  });
}

export async function fetchManusConfig({ path = "/v1/config/line", overrides = {} } = {}) {
  const config = resolveConfig(overrides);
  return await requestManus({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    path,
    method: "GET",
    userAgent: config.userAgent,
  });
}
