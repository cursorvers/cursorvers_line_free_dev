import assert from 'node:assert/strict';
import test from 'node:test';
import { generateWorkflowInventory } from '../../scripts/automation/generate-workflow-inventory.mjs';

test('generateWorkflowInventory returns owner metadata from workflows', async () => {
  const result = await generateWorkflowInventory({ dryRun: true });
  const lineEvent = result.rows.find((row) => row.file.endsWith('line-event.yml'));
  assert.ok(lineEvent, 'line-event.yml row is present');
  assert.equal(lineEvent.owner, 'devops');
  assert.match(lineEvent.permissions ?? '', /contents:\s*write/, 'line-event.yml permissions include contents: write');
});
