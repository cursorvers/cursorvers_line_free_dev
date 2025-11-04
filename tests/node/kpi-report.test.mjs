import test from 'node:test';
import assert from 'node:assert/strict';

const modulePath = '../../scripts/kpi/generate-kpi-report.js';

test('buildSummary marks target met when conversion rate ≥ target', async () => {
  const { buildSummary } = await import(modulePath);
  const summary = buildSummary(
    {
      total_subscribers: 100,
      paid_conversions: 45,
      conversion_rate: 0.45,
      status: 'ok',
    },
    { startDate: '2025-01-01', endDate: '2025-01-07' },
    0.4,
  );
  assert.match(summary, /✅ Target met/);
  assert.match(summary, /2025-01-01/);
  assert.match(summary, /2025-01-07/);
});

test('buildSummary flags below-target conversion rate', async () => {
  const { buildSummary } = await import(modulePath);
  const summary = buildSummary(
    {
      total_subscribers: 80,
      paid_conversions: 10,
      conversion_rate: 0.125,
      status: 'ok',
    },
    { startDate: '2025-02-01', endDate: '2025-02-08' },
    0.4,
  );
  assert.match(summary, /⚠️ Below target/);
  assert.match(summary, /40%/);
});

test('fetchFromSupabase returns placeholder when credentials missing', async () => {
  const { fetchFromSupabase } = await import(modulePath);
  const result = await fetchFromSupabase({ startDate: '2025-03-01', endDate: '2025-03-08' });
  assert.equal(result.status, 'missing_supabase_credentials');
  assert.equal(result.total_subscribers, 0);
});
