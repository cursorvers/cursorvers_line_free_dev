#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

function uniq(array) {
  return [...new Set(array.filter(Boolean))];
}

async function readFileIfExists(path) {
  try {
    return await fs.readFile(path, 'utf-8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function collectMetrics(inputs = []) {
  const paths = inputs.length > 0 ? inputs : ['tmp/gemini/metrics.jsonl'];
  const records = [];

  for (const input of paths) {
    const absPath = resolve(input);
    let stat;
    try {
      stat = await fs.stat(absPath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    if (stat.isDirectory()) {
      const entries = await fs.readdir(absPath);
      for (const entry of entries) {
        if (!entry.endsWith('.jsonl')) continue;
        const data = await readFileIfExists(resolve(absPath, entry));
        if (data) {
          parseJsonl(data, records);
        }
      }
    } else {
      const data = await readFileIfExists(absPath);
      if (data) {
        parseJsonl(data, records);
      }
    }
  }

  return records;
}

function parseJsonl(data, target) {
  const lines = data.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      target.push(parsed);
    } catch (_error) {
      // Skip malformed lines
    }
  }
}

export function aggregateMetrics(records) {
  if (!records.length) {
    return {
      total_runs: 0,
      success_rate: 0,
      avg_duration_ms: 0,
      avg_latency_ms: 0,
      total_cost: 0,
      failures: 0,
      status_breakdown: {},
      unique_models: [],
    };
  }

  const breakdown = {};
  let durationSum = 0;
  let latencySum = 0;
  let durationCount = 0;
  let latencyCount = 0;
  let totalCost = 0;
  const models = [];

  for (const record of records) {
    const status = typeof record.status === 'string' ? record.status : 'unknown';
    breakdown[status] = (breakdown[status] ?? 0) + 1;

    const duration = Number(record.duration_ms);
    if (Number.isFinite(duration)) {
      durationSum += duration;
      durationCount += 1;
    }
    const latency = Number(record.latency_ms);
    if (Number.isFinite(latency)) {
      latencySum += latency;
      latencyCount += 1;
    }
    const cost = Number(record.cost_estimate);
    if (Number.isFinite(cost)) {
      totalCost += cost;
    }
    if (record.model) {
      models.push(String(record.model));
    }
  }

  const totalRuns = records.length;
  const successCount = breakdown.ok ?? 0;
  const failureCount = totalRuns - successCount - (breakdown.skipped_no_logs ?? 0) - (breakdown.skipped_missing_key ?? 0);
  const avgDuration = durationCount > 0 ? durationSum / durationCount : 0;
  const avgLatency = latencyCount > 0 ? latencySum / latencyCount : 0;

  return {
    total_runs: totalRuns,
    success_rate: totalRuns > 0 ? successCount / totalRuns : 0,
    avg_duration_ms: avgDuration,
    avg_latency_ms: avgLatency,
    total_cost: totalCost,
    failures: failureCount < 0 ? 0 : failureCount,
    status_breakdown: breakdown,
    unique_models: uniq(models),
  };
}

export function formatMarkdown(summary) {
  const rate = `${Math.round(summary.success_rate * 100)}%`;
  const rows = [
    ['Metric', 'Value'],
    ['Total Runs', String(summary.total_runs)],
    ['Success Rate', rate],
    ['Avg Duration (ms)', summary.avg_duration_ms.toFixed(1)],
    ['Avg Latency (ms)', summary.avg_latency_ms.toFixed(1)],
    ['Total Cost', summary.total_cost.toFixed(6)],
    ['Failures', String(summary.failures)],
  ];

  const lines = rows.map(([k, v]) => `| ${k} | ${v} |`);
  return ['| Metric | Value |', '| --- | --- |', ...lines].join('\n');
}

function parseArgs(argv) {
  const options = { inputs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') {
      options.inputs.push(argv[++i]);
    } else if (arg === '--markdown' || arg === '-m') {
      options.markdown = true;
    } else if (arg === '--output' || arg === '-o') {
      options.output = argv[++i];
    }
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const records = await collectMetrics(args.inputs);
  const summary = aggregateMetrics(records);
  const json = JSON.stringify(summary, null, 2);

  if (args.output) {
    await fs.writeFile(resolve(args.output), `${json}\n`, 'utf-8');
  } else {
    console.log(json);
  }

  if (args.markdown) {
    const markdown = formatMarkdown(summary);
    if (args.output) {
      const markdownPath = resolve(`${args.output}.md`);
      await fs.writeFile(markdownPath, `${markdown}\n`, 'utf-8');
    } else {
      console.log('\n' + markdown);
    }
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error('Failed to generate Gemini metrics report:', error);
    process.exit(1);
  });
}
