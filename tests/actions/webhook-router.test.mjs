import assert from 'node:assert/strict';
import test from 'node:test';

async function loadRouterModule() {
  const originalArgv = process.argv;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalRepo = process.env.GITHUB_REPOSITORY;
  const originalGhRepo = process.env.REPOSITORY;
  const originalLabels = process.env.ISSUE_LABELS;

  process.argv = ['node', 'scripts/webhook-router.mjs', 'issue', 'opened'];
  process.env.GITHUB_TOKEN = originalToken ?? 'test-token';
  process.env.GITHUB_REPOSITORY = originalRepo ?? 'owner/repo';
  delete process.env.REPOSITORY;
  process.env.ISSUE_LABELS = originalLabels ?? '[]';

  try {
    const module = await import('../../scripts/webhook-router.mjs');
    return module;
  } finally {
    process.argv = originalArgv;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
    if (originalRepo === undefined) {
      delete process.env.GITHUB_REPOSITORY;
    } else {
      process.env.GITHUB_REPOSITORY = originalRepo;
    }
    if (originalGhRepo === undefined) {
      delete process.env.REPOSITORY;
    } else {
      process.env.REPOSITORY = originalGhRepo;
    }
    if (originalLabels === undefined) {
      delete process.env.ISSUE_LABELS;
    } else {
      process.env.ISSUE_LABELS = originalLabels;
    }
  }
}

test('determineStateFromLabels prefers blocked over other states', async () => {
  const { determineStateFromLabels } = await loadRouterModule();
  const state = determineStateFromLabels([
    '📥 state:pending',
    '🚫 state:blocked',
    '🏗️ state:implementing',
  ]);
  assert.equal(state, '🚫 state:blocked');
});

test('determineStateFromLabels falls back to pending when no priority match', async () => {
  const { determineStateFromLabels } = await loadRouterModule();
  const state = determineStateFromLabels(['📥 state:pending']);
  assert.equal(state, '📥 state:pending');
});
