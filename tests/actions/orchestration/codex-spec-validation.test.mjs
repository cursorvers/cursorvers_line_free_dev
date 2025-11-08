import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadSpec } from '../../../scripts/orchestration/load-spec.mjs';
import { createRuleEngine } from '../../../scripts/orchestration/execute-rules.mjs';
import { evaluateLineEvents } from '../../../scripts/orchestration/evaluate-line-event.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');
const SPEC_PATH = join(PROJECT_ROOT, 'codex.spec.yaml');

async function getEngine() {
  const spec = await loadSpec(SPEC_PATH);
  return createRuleEngine(spec);
}

test('cmd_detail event triggers scenario template action', async () => {
  const engine = await getEngine();
  const result = engine.evaluate({
    event: 'cmd_detail',
    user: { tags: [] }
  });
  assert.equal(result.triggered.length, 1);
  const op = result.triggered[0].operations.find((entry) => entry.type === 'send_message');
  assert.ok(op, 'expected send_message operation');
  assert.equal(op.payload.template, 'scenario_cmd_detail');
});

test('cmd_gift event triggers scenario template action', async () => {
  const engine = await getEngine();
  const result = engine.evaluate({
    event: 'cmd_gift',
    user: { tags: [] }
  });
  assert.equal(result.triggered.length, 1);
  const op = result.triggered[0].operations.find((entry) => entry.type === 'send_message');
  assert.ok(op);
  assert.equal(op.payload.template, 'scenario_cmd_gift');
});

test('cmd_contact event triggers scenario template action', async () => {
  const engine = await getEngine();
  const result = engine.evaluate({
    event: 'cmd_contact',
    user: { tags: [] },
    payload: {
      text: 'お問い合わせ'
    }
  });
  assert.equal(result.triggered.length, 1);
  const op = result.triggered[0].operations.find((entry) => entry.type === 'send_message');
  assert.ok(op);
  assert.equal(op.payload.template, 'scenario_cmd_contact');
});

test('V1 add_line: welcome flow sets conversion tag and sends template', async () => {
  const engine = await getEngine();
  const result = engine.evaluate({
    event: 'add_line',
    user: { tags: [] },
    payload: { message: null }
  });

  assert.equal(result.triggered.length, 1);
  const operations = result.triggered[0].operations;

  const tagOp = operations.find((op) => op.type === 'tag');
  assert.ok(tagOp, 'expected tag operation');
  assert.deepEqual(tagOp.payload.add, ['conversion_invited']);

  const sendOp = operations.find((op) => op.type === 'send_message');
  assert.ok(sendOp, 'expected send_message operation');
  assert.equal(sendOp.payload.template, 'scenario_add_line');
});

test('V2 line_message: text message routes to GPT analysis handler', async () => {
  const engine = await getEngine();
  const result = engine.evaluate({
    event: 'line_message',
    user: { tags: [] },
    payload: {
      message: {
        type: 'text',
        text: 'テスト'
      }
    }
  });

  assert.equal(result.triggered.length, 1);
  const operations = result.triggered[0].operations;
  const actionOp = operations.find((op) => op.type === 'action');
  assert.ok(actionOp, 'expected action operation');
  assert.equal(actionOp.name, 'process_message');
  assert.equal(actionOp.parameters.handler, 'gpt_analysis');
});

test('V3 line_message: PHI detection blocks sensitive payloads', async () => {
  const engine = await getEngine();
  const evaluation = engine.evaluate({
    event: 'line_message',
    user: { tags: [] },
    payload: {
      text: '連絡先は example@example.com です',
      message: {
        type: 'text',
        text: '連絡先は example@example.com です'
      }
    }
  });

  assert.equal(evaluation.triggered.length, 0);
  assert.equal(evaluation.violations.length, 1);
  const violation = evaluation.violations[0].constraints[0];
  assert.equal(violation.type, 'phi_filter');
  assert.equal(violation.details.action, 'remove_and_warn');
});

test('V4 note_viewed: tag update recorded without constraint violations', async () => {
  const engine = await getEngine();
  const result = engine.evaluate({
    event: 'note_viewed',
    user: { tags: [] },
    payload: {
      note_user_id: 'note-123',
      article_id: 'article-456'
    }
  });

  assert.equal(result.triggered.length, 1);
  const operations = result.triggered[0].operations;
  const tagOp = operations.find((op) => op.type === 'tag');
  assert.ok(tagOp, 'expected tag operation');
  assert.deepEqual(tagOp.payload.add, ['note_viewed']);
  assert.equal(result.violations.length, 0);
});

test('V5 note_payment_completed: tag + thank-you template applied', async () => {
  const engine = await getEngine();
  const result = engine.evaluate({
    event: 'note_payment_completed',
    user: { tags: [] },
    payload: {
      note_user_id: 'note-123',
      amount: 1200
    }
  });

  assert.equal(result.triggered.length, 1);
  const operations = result.triggered[0].operations;

  const tagOp = operations.find((op) => op.type === 'tag');
  assert.ok(tagOp, 'expected tag operation');
  assert.deepEqual(tagOp.payload.add, ['payment_completed']);

  const sendOp = operations.find((op) => op.type === 'send_message');
  assert.ok(sendOp, 'expected send_message operation');
  assert.equal(sendOp.payload.template, 'payment_thanks');
});

test('V6 evaluateLineEvents: PHI violation blocks LINE payload end-to-end', async () => {
  const engine = await getEngine();
  const events = [
    {
      type: 'message',
      message: {
        type: 'text',
        text: 'メールは personal@mail.test'
      }
    }
  ];

  const result = evaluateLineEvents(engine, events);
  assert.equal(result.blocked, true);
  assert.equal(result.results.length, 1);
  const violation = result.results[0].violations[0].constraints[0];
  assert.equal(violation.type, 'phi_filter');
  assert.equal(violation.details.action, 'remove_and_warn');
});
