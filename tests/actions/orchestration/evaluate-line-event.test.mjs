import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuleEngine } from '../../../scripts/orchestration/execute-rules.mjs';
import { evaluateLineEvents } from '../../../scripts/orchestration/evaluate-line-event.mjs';

const spec = {
  events: ['cmd_done', 'cmd_detail', 'line_message'],
  rules: [
    {
      id: 'value_complete_invite',
      when: "event == 'cmd_done'",
      do: [
        {
          send_message: {
            body: '詳細は https://trusted.example.com'
          }
        }
      ],
      constraints: [
        { type: 'phi_filter', enabled: true },
        { type: 'verified_domain', enabled: true }
      ]
    },
    {
      id: 'detail_info',
      when: "event == 'cmd_detail'",
      do: [
        {
          send_message: {
            body: '体験の案内です。'
          }
        }
      ],
      constraints: [
        { type: 'verified_domain', enabled: true }
      ]
    },
    {
      id: 'inbound_message_safety',
      when: "event == 'line_message'",
      do: [],
      constraints: [
        { type: 'phi_filter', enabled: true }
      ]
    }
  ],
  constraints: {
    phi_filter: {
      enabled: true,
      action_on_detect: 'remove_and_warn',
      patterns: [
        { type: 'email', regex: '[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}' }
      ]
    },
    verified_domain: {
      enabled: true,
      allowed_domains: ['trusted.example.com'],
      action_on_unverified: 'reject'
    }
  }
};

test('evaluateLineEvents detects PHI violation', () => {
  const engine = createRuleEngine(spec);
  const events = [
    {
      type: 'message',
      message: {
        type: 'text',
        text: '連絡先は user@example.com です'
      }
    }
  ];

  const result = evaluateLineEvents(engine, events);
  assert.equal(result.results.length, 1);
  assert.equal(result.blocked, true);
  const violation = result.results[0].violations[0].constraints[0];
  assert.equal(violation.details.action, 'remove_and_warn');
});

test('evaluateLineEvents passes when no violations', () => {
  const engine = createRuleEngine(spec);
  const events = [
    {
      type: 'message',
      message: {
        type: 'text',
        text: '#詳しく'
      }
    }
  ];

  const result = evaluateLineEvents(engine, events);
  assert.equal(result.blocked, false);
  assert.equal(result.results[0].violations.length, 0);
});
