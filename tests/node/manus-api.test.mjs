import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { createManusTask } = await import(join(__dirname, '../../scripts/lib/manus-api.js'));

test('createManusTask returns payload in dry-run mode with metadata and idempotency', async () => {
  const originalEnv = {
    MANUS_API_KEY: process.env.MANUS_API_KEY,
    MANUS_DRY_RUN: process.env.MANUS_DRY_RUN,
    MANUS_BASE_URL: process.env.MANUS_BASE_URL,
    PROGRESS_WEBHOOK_URL: process.env.PROGRESS_WEBHOOK_URL
  };
  try {
    delete process.env.MANUS_API_KEY;
    process.env.MANUS_DRY_RUN = 'true';
    process.env.PROGRESS_WEBHOOK_URL = 'https://hooks.example.com/progress';

    const plan = { title: 'Test Plan', steps: [{ id: 's1', action: 'noop', connector: 'noop', payload: {} }] };
    const result = await createManusTask({
      brief: 'Test Brief',
      plan,
      webhookUrl: 'https://hooks.override.example.com',
      metadata: {
        idempotency_key: 'retry-123',
        retry: { attempt: 2 }
      }
    });

    assert.equal(result.dryRun, true);
    assert.ok(result.payload.prompt.includes('Test Brief'));
    assert.deepEqual(result.payload.plan, plan);
    assert.equal(result.payload.webhook_url, 'https://hooks.override.example.com');
    assert.equal(result.payload.idempotency_key, 'retry-123');
    assert.deepEqual(result.payload.metadata.retry, { attempt: 2 });
  } finally {
    process.env.MANUS_API_KEY = originalEnv.MANUS_API_KEY;
    process.env.MANUS_DRY_RUN = originalEnv.MANUS_DRY_RUN;
    process.env.MANUS_BASE_URL = originalEnv.MANUS_BASE_URL;
    process.env.PROGRESS_WEBHOOK_URL = originalEnv.PROGRESS_WEBHOOK_URL;
  }
});
