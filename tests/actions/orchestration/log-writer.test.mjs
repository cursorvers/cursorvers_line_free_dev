import test from 'node:test';
import assert from 'node:assert/strict';
import { writeLogs } from '../../../scripts/orchestration/log-writer.mjs';

test('writeLogs skips when Supabase credentials missing', async () => {
  const result = await writeLogs([{ event_id: 'e1' }], { env: {} });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'missing_supabase_credentials');
});

test('writeLogs posts entries to Supabase', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      text: async () => ''
    };
  };
  const env = {
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SERVICE_ROLE_KEY: 'secret-key'
  };
  const entries = [
    { event_id: 'e1', timestamp: '2025-11-06T00:00:00Z', status: 'sent' }
  ];
  const result = await writeLogs(entries, { env });
  assert.equal(result.inserted, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://supabase.example/rest/v1/event_logs');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body[0].payload.event_id, 'e1');
  globalThis.fetch = originalFetch;
});
