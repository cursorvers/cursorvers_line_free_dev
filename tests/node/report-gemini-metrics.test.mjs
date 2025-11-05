import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collectMetrics,
  aggregateMetrics,
  formatMarkdown,
} from '../../scripts/automation/report-gemini-metrics.mjs';

test('collectMetrics aggregates records from jsonl files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gemini-metrics-'));
  const file = join(dir, 'metrics.jsonl');
  const content = [
    JSON.stringify({ status: 'ok', duration_ms: 2000, latency_ms: 1500, cost_estimate: 0.002, model: 'gemini-1.5' }),
    JSON.stringify({ status: 'error', duration_ms: 2500, latency_ms: 1800, cost_estimate: 0.002, model: 'gemini-1.5' }),
    JSON.stringify({ status: 'skipped_no_logs', duration_ms: 500, latency_ms: 0, cost_estimate: 0 }),
  ].join('\n');
  await writeFile(file, content, 'utf-8');

  const records = await collectMetrics([dir]);
  assert.equal(records.length, 3);
  const summary = aggregateMetrics(records);
  assert.equal(summary.total_runs, 3);
  assert.ok(summary.success_rate > 0 && summary.success_rate < 1);
  assert.equal(summary.status_breakdown.ok, 1);
  assert.equal(summary.status_breakdown.error, 1);
  assert.equal(summary.unique_models.includes('gemini-1.5'), true);
  assert.ok(summary.total_cost > 0);

  await rm(dir, { recursive: true, force: true });
});

test('aggregateMetrics handles empty input', () => {
  const summary = aggregateMetrics([]);
  assert.equal(summary.total_runs, 0);
  assert.equal(summary.success_rate, 0);
  assert.equal(summary.total_cost, 0);
});

test('formatMarkdown produces table output', () => {
  const markdown = formatMarkdown({
    total_runs: 2,
    success_rate: 0.5,
    avg_duration_ms: 2100,
    avg_latency_ms: 1700,
    total_cost: 0.004,
    failures: 1,
  });
  assert.ok(markdown.includes('| Total Runs | 2 |'));
  assert.ok(markdown.includes('| Success Rate | 50% |'));
});
