import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorkflowConfig } from '../../scripts/checks/validate-config.mjs';

const manifestPath = new URL('../../config/workflows/required-secrets.json', import.meta.url);

test('validateWorkflowConfig reports missing secrets', async () => {
  const result = await validateWorkflowConfig({
    workflow: 'line-event.yml',
    manifestPath,
    env: {},
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('SUPABASE_URL'));
  assert.ok(result.missingDetails.some((detail) => detail.key === 'SUPABASE_URL'));
  const alt = result.missingAlternatives[0];
  assert.ok(Array.isArray(alt));
  assert.ok(alt.includes('NOTIFY_WEBHOOK_URL'));
  assert.ok(Array.isArray(result.entries));
  const supabaseEntry = result.entries.find((entry) => entry.requirement.key === 'SUPABASE_URL');
  assert.ok(supabaseEntry);
  assert.equal(supabaseEntry.requirement.parameter, 'SUPABASE_URL');
  assert.equal(supabaseEntry.present, false);
});

test('validateWorkflowConfig passes when requirements met', async () => {
  const result = await validateWorkflowConfig({
    workflow: 'line-event.yml',
    manifestPath,
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      GOOGLE_SERVICE_ACCOUNT_JSON: '{}',
      GOOGLE_SHEET_ID: 'sheet',
      MANUS_API_KEY: 'key',
      MANUS_BASE_URL: 'https://manus',
      GEMINI_API_KEY: 'token',
      LINE_CHANNEL_ACCESS_TOKEN: 'token-line',
      NOTIFY_WEBHOOK_URL: 'https://webhook',
    },
  });
  assert.equal(result.ok, true);
  assert.ok(result.entries.every((entry) => typeof entry.present === 'boolean'));
});
