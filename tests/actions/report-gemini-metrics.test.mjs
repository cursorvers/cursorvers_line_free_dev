import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateMetrics, formatMarkdown } from '../../scripts/automation/report-gemini-metrics.mjs';

test('aggregateMetrics computes averages and percentiles', () => {
  const records = [
    { status: 'ok', latency_ms: 80, duration_ms: 95, cost_estimate: 0.02, anomalies_count: 1, model: 'gemini-a' },
    { status: 'error', latency_ms: 140, duration_ms: 170, cost_estimate: 0.02, anomalies_count: 0, model: 'gemini-a' },
    { status: 'ok', latency_ms: 40, duration_ms: 60, cost_estimate: 0.02, anomalies_count: 2, model: 'gemini-b' },
  ];

  const summary = aggregateMetrics(records);

  assert.equal(summary.total_runs, 3);
  assert.equal(summary.status_breakdown.ok, 2);
  assert.equal(summary.status_breakdown.error, 1);
  assert.ok(summary.avg_latency_ms > 0);
  assert.ok(summary.latency_percentiles_ms.p95 >= summary.latency_percentiles_ms.p50);
  assert.equal(summary.total_anomalies, 3);
  assert.ok(summary.unique_models.includes('gemini-a'));
});

test('formatMarkdown renders summary table', () => {
  const summary = {
    total_runs: 2,
    success_rate: 0.5,
    avg_duration_ms: 120,
    avg_latency_ms: 90,
    total_cost: 0.123456,
    failures: 1,
    status_breakdown: { ok: 1, error: 1 },
    unique_models: ['flash'],
    latency_percentiles_ms: { p50: 80, p90: 100, p95: 110 },
    duration_percentiles_ms: { p50: 110, p90: 130, p95: 150 },
    total_anomalies: 2,
  };

  const markdown = formatMarkdown(summary);
  assert.ok(markdown.includes('Total Runs'));
  assert.ok(markdown.includes('Latency p95'));
  assert.ok(markdown.includes('Total Anomalies'));
});
