#!/usr/bin/env node
/**
 * Manus API Client for GitHub Actions
 * Node.js version of the Deno manus-api.ts
 *
 * Usage:
 *   node scripts/manus-api.js create <brief_file> <plan_file>
 *   node scripts/manus-api.js status <task_id>
 */

const fs = require("fs");
const https = require("https");
const path = require("path");

// Configuration
const MANUS_API_KEY = process.env.MANUS_API_KEY || "";
const MANUS_BASE_URL = process.env.MANUS_BASE_URL || "https://api.manus.ai";
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

// Retry-able status codes
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make HTTP request with retries
 */
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  let lastError;
  let delay = INITIAL_DELAY_MS;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await makeRequest(url, options);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return response;
      }

      if (RETRYABLE_STATUS_CODES.includes(response.statusCode) && attempt < retries) {
        console.error(`[Attempt ${attempt}/${retries}] Status ${response.statusCode}, retrying in ${delay}ms...`);
        await sleep(delay);
        delay *= 2; // Exponential backoff
        continue;
      }

      throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
    } catch (error) {
      lastError = error;
      if (attempt < retries && isRetryableError(error)) {
        console.error(`[Attempt ${attempt}/${retries}] Error: ${error.message}, retrying in ${delay}ms...`);
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error) {
  const message = error.message || "";
  return (
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNREFUSED") ||
    message.includes("socket hang up")
  );
}

/**
 * Make HTTP request (promisified)
 */
function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const req = https.request(reqOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Sanitize user input for prompt injection protection
 */
function sanitizeForPrompt(input, maxLength = 500) {
  if (!input || typeof input !== "string") {
    return "";
  }

  let sanitized = input
    .slice(0, maxLength)
    .replace(/ignore\s+(all\s+)?previous\s+instructions?/gi, "[REMOVED]")
    .replace(/disregard\s+(all\s+)?prior\s+(instructions?|context)/gi, "[REMOVED]")
    .replace(/forget\s+(everything|all|previous)/gi, "[REMOVED]")
    .replace(/override\s+(instructions?|rules?|constraints?)/gi, "[REMOVED]")
    .replace(/system\s*:\s*/gi, "system: ")
    .replace(/```[\s\S]*?```/g, "[CODE BLOCK REMOVED]")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (input.length > maxLength) {
    sanitized += "...[truncated]";
  }

  return sanitized;
}

/**
 * Create a Manus task
 */
async function createTask(briefPath, planPath) {
  if (!MANUS_API_KEY) {
    console.error("Error: MANUS_API_KEY environment variable is not set");
    process.exit(1);
  }

  // Read files
  if (!fs.existsSync(briefPath)) {
    console.error(`Error: Brief file not found: ${briefPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(planPath)) {
    console.error(`Error: Plan file not found: ${planPath}`);
    process.exit(1);
  }

  const brief = fs.readFileSync(briefPath, "utf-8");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf-8"));

  // Build prompt
  const prompt = `${brief}

## Plan JSON

\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`

Please execute this plan step by step.
`;

  console.log(`Creating Manus task...`);
  console.log(`  Brief: ${briefPath}`);
  console.log(`  Plan: ${planPath}`);
  console.log(`  Prompt length: ${prompt.length} chars`);

  const response = await fetchWithRetry(`${MANUS_BASE_URL}/v1/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      API_KEY: MANUS_API_KEY,
    },
    body: JSON.stringify({
      prompt,
      agentProfile: "manus-1.6",
      taskMode: "agent",
      locale: "ja",
      hideInTaskList: false,
      createShareableLink: true,
    }),
  });

  const data = JSON.parse(response.body);
  console.log("\nTask created successfully!");
  console.log(`  Task ID: ${data.task_id}`);
  console.log(`  Task URL: ${data.task_url}`);
  if (data.share_url) {
    console.log(`  Share URL: ${data.share_url}`);
  }

  // Output for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `task_id=${data.task_id}\ntask_url=${data.task_url}\n`
    );
  }

  return data;
}

/**
 * Get task status
 */
async function getTaskStatus(taskId) {
  if (!MANUS_API_KEY) {
    console.error("Error: MANUS_API_KEY environment variable is not set");
    process.exit(1);
  }

  console.log(`Getting status for task: ${taskId}`);

  const response = await fetchWithRetry(`${MANUS_BASE_URL}/v1/tasks/${taskId}`, {
    method: "GET",
    headers: {
      API_KEY: MANUS_API_KEY,
    },
  });

  const data = JSON.parse(response.body);
  console.log("\nTask Status:");
  console.log(JSON.stringify(data, null, 2));

  return data;
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case "create":
        if (args.length < 3) {
          console.error("Usage: node manus-api.js create <brief_file> <plan_file>");
          process.exit(1);
        }
        await createTask(args[1], args[2]);
        break;

      case "status":
        if (args.length < 2) {
          console.error("Usage: node manus-api.js status <task_id>");
          process.exit(1);
        }
        await getTaskStatus(args[1]);
        break;

      default:
        console.error("Unknown command. Available commands: create, status");
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
