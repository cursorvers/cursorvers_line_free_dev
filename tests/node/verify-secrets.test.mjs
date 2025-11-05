import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWorkflow } from '../../scripts/checks/verify-secrets.mjs';

test('evaluateWorkflow returns missing lists when env empty', () => {
  const spec = {
    required: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    alternatives: [['NOTIFY_WEBHOOK_URL', 'PROGRESS_WEBHOOK_URL']],
  };
  const result = evaluateWorkflow('line-event.yml', spec, {});
  assert.deepEqual(result.missingRequired, spec.required);
  assert.equal(result.alternativeFailures.length, 1);
});

test('evaluateWorkflow succeeds when requirements met', () => {
  const spec = {
    required: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    alternatives: [['NOTIFY_WEBHOOK_URL', 'PROGRESS_WEBHOOK_URL']],
  };
  const env = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'key',
    PROGRESS_WEBHOOK_URL: 'https://hooks.example.com',
  };
  const result = evaluateWorkflow('line-event.yml', spec, env);
  assert.deepEqual(result.missingRequired, []);
  assert.deepEqual(result.alternativeFailures, []);
});
