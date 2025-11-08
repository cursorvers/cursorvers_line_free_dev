import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuleEngine } from '../../../scripts/orchestration/execute-rules.mjs';

const baseSpec = {
  events: ['cmd_detail', 'cmd_participate'],
  rules: [
    {
      id: 'detail_info',
      when: "event == 'cmd_detail'",
      do: [
        {
          send_message: {
            body: '無料体験は2週・週2通。終えたら「#完了」で提出。'
          }
        }
      ]
    },
    {
      id: 'schedule_reply',
      when: "event == 'cmd_participate'",
      if: "not user.tags.contains('paid_active')",
      do: [
        {
          send_message: {
            body: '次回コホート: https://example.com/schedule'
          }
        }
      ]
    }
  ],
  constraints: {}
};

test('rule engine returns send_message for cmd_detail', () => {
  const engine = createRuleEngine(baseSpec);
  const result = engine.evaluate({ event: 'cmd_detail', user: { tags: [] } });
  assert.equal(result.triggered.length, 1);
  const op = result.triggered[0].operations.find((entry) => entry.type === 'send_message');
  assert.ok(op, 'send_message action should exist');
  assert.match(op.payload.body, /無料体験/);
});

test('rule engine respects paid_active guard on cmd_participate', () => {
  const engine = createRuleEngine(baseSpec);
  const result = engine.evaluate({ event: 'cmd_participate', user: { tags: ['paid_active'] } });
  assert.equal(result.triggered.length, 0);
});

test('rule engine triggers schedule reply when user not paid', () => {
  const engine = createRuleEngine(baseSpec);
  const result = engine.evaluate({ event: 'cmd_participate', user: { tags: [] } });
  assert.equal(result.triggered.length, 1);
  const op = result.triggered[0].operations.find((entry) => entry.type === 'send_message');
  assert.match(op.payload.body, /次回コホート/);
});
