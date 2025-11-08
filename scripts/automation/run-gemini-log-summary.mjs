#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const DEFAULT_INPUT = 'logs/progress';
const DEFAULT_OUTPUT = 'tmp/gemini/log-summary.json';
const DEFAULT_LIMIT = 50;
const DEFAULT_MODEL = 'gemini-1.5-flash-latest';
const DEFAULT_COST_PER_CALL = Number(process.env.GEMINI_COST_PER_CALL ?? process.env.GEMINI_COST_PER_CALL_DEFAULT ?? 0);
const DEFAULT_METRICS_PATH = null;
const DEFAULT_DRIVER = (process.env.GEMINI_SUMMARY_DRIVER ?? 'api').toLowerCase();
const DEFAULT_CLI_PATH = process.env.GEMINI_CLI_PATH ?? 'gemini';
const DEFAULT_CLI_WORKSPACE = process.env.GEMINI_CLI_WORKSPACE ?? join(process.cwd(), '.gemini-cli');
const DEFAULT_CLI_PROMPT = process.env.GEMINI_CLI_PROMPT ??
  'You are assisting with LINE automation monitoring. Respond ONLY with minified JSON: {"summary": string, "anomalies": string[], "observations": string[]}.';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function listLogFiles(inputDir) {
  try {
    const entries = await fs.readdir(inputDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort()
      .map((name) => resolve(inputDir, name));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function scrubEvent(event = {}) {
  const source = event.source || {};
  const message = event.message || {};
  return {
    type: event.type ?? 'unknown',
    timestamp: event.timestamp ?? null,
    source_type: source.type ?? null,
    hashed_user_id: source.userId ?? null,
    message_type: message.type ?? null,
    has_message_text: Boolean(message.text && String(message.text).trim()),
    message_text_length: message.text ? String(message.text).length : 0,
    reply_token_present: Boolean(event.replyToken),
  };
}

export function sanitizeLogPayload(raw = {}, filename) {
  const events = toArray(raw.events).map(scrubEvent);
  return {
    file: filename,
    event_id: raw.event_id ?? null,
    received_at: raw.received_at ?? raw.created_at ?? null,
    event_count: events.length,
    events,
    signature_valid: raw.signature_valid ?? null,
    plan_mode: raw.plan_mode ?? raw.mode ?? null,
    manus_decision: raw.manus_decision ?? null,
    warnings: raw.warnings ?? [],
  };
}

export async function collectSanitizedLogs({ inputDir, limit }) {
  const files = await listLogFiles(inputDir);
  if (files.length === 0) {
    return [];
  }
  const selected = files.slice(-Math.max(1, limit));
  const results = [];
  for (const file of selected) {
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const json = JSON.parse(raw);
      results.push(sanitizeLogPayload(json, file));
    } catch (error) {
      results.push({
        file,
        status: 'read_error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export function buildPromptPayload(logs) {
  return {
    instructions: {
      objective: 'Summarize recent LINE automation logs and surface anomalies.',
      output_format: {
        type: 'object',
        fields: {
          summary: 'Concise natural language summary (<= 60 words).',
          anomalies: 'Array of notable issues or empty array.',
          observations: 'Optional extra notes (array of strings).',
        },
      },
      guidance: [
        'Do not invent incidents.',
        'Focus on trend-level insight and unusual patterns.',
        'If information is insufficient, indicate that clearly.',
      ],
    },
    logs,
  };
}

export async function callGeminiViaApi({ apiKey, model = DEFAULT_MODEL, payload, fetchImpl = globalThis.fetch }) {
  if (!fetchImpl) {
    throw new Error('fetch implementation is required');
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'You are assisting with LINE automation monitoring. Provide JSON only.' +
              '\n\nINPUT:\n' + JSON.stringify(payload),
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const part = candidate?.content?.parts?.[0];
  const text = part?.text ?? '';

  if (!text) {
    throw new Error('Gemini response missing text payload');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse Gemini JSON: ${error instanceof Error ? error.message : error}`);
  }

  return {
    parsed,
    raw: data,
  };
}

function extractCliJson(stdout) {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Gemini CLI response missing JSON payload');
  }
  const jsonSlice = trimmed.slice(start, end + 1);
  return JSON.parse(jsonSlice);
}

export async function callGeminiViaCli({
  payload,
  model = DEFAULT_MODEL,
  cliPath = DEFAULT_CLI_PATH,
  cliPrompt = DEFAULT_CLI_PROMPT,
  workspaceDir = DEFAULT_CLI_WORKSPACE,
  apiKey = process.env.GEMINI_API_KEY,
}) {
  if (!apiKey) {
    throw new Error('Gemini CLI requires GEMINI_API_KEY');
  }
  await fs.mkdir(workspaceDir, { recursive: true });

  const args = [
    '--model', model,
    '--prompt', cliPrompt,
    '--telemetry=false',
    '--debug=false',
    '--yolo',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args, {
      cwd: workspaceDir,
      env: {
        ...process.env,
        GEMINI_API_KEY: apiKey,
        HOME: workspaceDir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();

    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Gemini CLI exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      try {
        const parsed = extractCliJson(stdout);
        resolve({
          parsed,
          raw: {
            stdout,
            stderr,
            driver: 'cli',
          },
        });
      } catch (error) {
        reject(new Error(`Failed to parse Gemini CLI output: ${error instanceof Error ? error.message : error}`));
      }
    });
  });
}

export async function callGemini(options) {
  const driver = (options?.driver ?? DEFAULT_DRIVER).toLowerCase();
  if (driver === 'cli') {
    return callGeminiViaCli(options);
  }
  return callGeminiViaApi(options);
}

export async function writeResult(outputPath, result) {
  await fs.mkdir(dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
}

function computeCostEstimate(costPerCall, status) {
  if (!Number.isFinite(costPerCall) || costPerCall <= 0) {
    return 0;
  }
  if (status && status.startsWith('skipped')) {
    return 0;
  }
  return Number(costPerCall);
}

async function appendMetricsRecord(metricsPath, record) {
  if (!metricsPath) return;
  const dir = dirname(metricsPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(metricsPath, `${JSON.stringify(record)}\n`, 'utf-8');
}

function buildMetricsRecord({ result, logs }, duration) {
  const runIdParts = [process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT].filter(Boolean);
  const runId = runIdParts.length ? runIdParts.join(':') : null;
  const anomaliesCount = Array.isArray(result.anomalies) ? result.anomalies.length : 0;
  const summaryLength = typeof result.summary === 'string' ? result.summary.length : 0;
  return {
    timestamp: new Date().toISOString(),
    run_id: runId,
    status: result.status,
    logs_count: result.logs_count ?? (Array.isArray(logs) ? logs.length : 0),
    latency_ms: Number(result.latency_ms ?? 0),
    duration_ms: Number.isFinite(duration) ? duration : Number(result.duration_ms ?? 0),
    cost_estimate: Number(result.cost_estimate ?? 0),
    model: result.model ?? null,
    anomalies_count: anomaliesCount,
    summary_length: summaryLength,
  };
}

export async function runGeminiLogSummary({
  inputDir = DEFAULT_INPUT,
  outputPath = DEFAULT_OUTPUT,
  limit = DEFAULT_LIMIT,
  model = DEFAULT_MODEL,
  apiKey = process.env.GEMINI_API_KEY,
  fetchImpl = globalThis.fetch,
  costPerCall = DEFAULT_COST_PER_CALL,
  metricsPath = DEFAULT_METRICS_PATH,
  driver = DEFAULT_DRIVER,
  cliPath = DEFAULT_CLI_PATH,
  cliWorkspaceDir = DEFAULT_CLI_WORKSPACE,
  cliPrompt = DEFAULT_CLI_PROMPT,
} = {}) {
  const startTotal = Date.now();
  const logs = await collectSanitizedLogs({ inputDir, limit });

  if (!apiKey) {
    const duration = Date.now() - startTotal;
    const result = {
      status: 'skipped_missing_key',
      summary: 'Gemini API key not configured. Skipping summary.',
      anomalies: [],
      raw_response: null,
      logs_count: logs.length,
      latency_ms: 0,
      cost_estimate: 0,
      duration_ms: duration,
    };
    await writeResult(outputPath, result);
    await appendMetricsRecord(metricsPath, buildMetricsRecord({ result, logs }, duration));
    return result;
  }

  if (logs.length === 0) {
    const duration = Date.now() - startTotal;
    const result = {
      status: 'skipped_no_logs',
      summary: 'No logs available for analysis.',
      anomalies: [],
      raw_response: null,
      logs_count: 0,
      latency_ms: 0,
      cost_estimate: 0,
      duration_ms: duration,
    };
    await writeResult(outputPath, result);
    await appendMetricsRecord(metricsPath, buildMetricsRecord({ result, logs }, duration));
    return result;
  }

  const payload = buildPromptPayload(logs);

  const start = Date.now();
  try {
    const { parsed, raw } = await callGemini({
      apiKey,
      model,
      payload,
      fetchImpl,
      driver,
      cliPath,
      workspaceDir: cliWorkspaceDir,
      cliPrompt,
    });
    const latency = Date.now() - start;
    const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
    const anomalies = Array.isArray(parsed.anomalies) ? parsed.anomalies : [];
    const observations = Array.isArray(parsed.observations) ? parsed.observations : [];

    const duration = Date.now() - start;
    const result = {
      status: 'ok',
      summary,
      anomalies,
      observations,
      raw_response: raw,
      logs_count: logs.length,
      model,
      latency_ms: latency,
      cost_estimate: computeCostEstimate(costPerCall, 'ok'),
      duration_ms: duration,
    };
    await writeResult(outputPath, result);
    await appendMetricsRecord(metricsPath, buildMetricsRecord({ result, logs }, duration));
    return result;
  } catch (error) {
    const latency = Date.now() - start;
    const status = 'error';
    const result = {
      status,
      summary: 'Gemini summary unavailable: ' + (error instanceof Error ? error.message : String(error)),
      anomalies: [],
      raw_response: null,
      logs_count: logs.length,
      latency_ms: latency,
      cost_estimate: computeCostEstimate(costPerCall, status),
      duration_ms: latency,
    };
    await writeResult(outputPath, result);
    await appendMetricsRecord(metricsPath, buildMetricsRecord({ result, logs }, latency));
    return result;
  }
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') {
      options.inputDir = argv[++i];
    } else if (arg === '--output' || arg === '-o') {
      options.outputPath = argv[++i];
    } else if (arg === '--limit' || arg === '-n') {
      const value = Number(argv[++i]);
      options.limit = Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_LIMIT;
    } else if (arg === '--model' || arg === '-m') {
      options.model = argv[++i];
    } else if (arg === '--cost' || arg === '-c') {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value >= 0) {
        options.costPerCall = value;
      }
    } else if (arg === '--metrics') {
      options.metricsPath = argv[++i];
    } else if (arg === '--driver') {
      options.driver = argv[++i];
    } else if (arg === '--cli-path') {
      options.cliPath = argv[++i];
    } else if (arg === '--cli-workspace') {
      options.cliWorkspaceDir = argv[++i];
    } else if (arg === '--cli-prompt') {
      options.cliPrompt = argv[++i];
    }
  }
  return options;
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  try {
    await runGeminiLogSummary(args);
  } catch (error) {
    console.error('Gemini log summary failed:', error instanceof Error ? error.message : error);
  }
  process.exit(0);
}

const executedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (executedPath && executedPath === import.meta.url) {
  runCli();
}
