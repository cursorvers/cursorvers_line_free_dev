import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuleEngine } from '../../../scripts/orchestration/execute-rules.mjs';

test('verified domain constraint allows configured domains', () => {
  const spec = {
    events: ['cmd_detail'],
    rules: [
      {
        id: 'detail_info',
        when: "event == 'cmd_detail'",
        do: [
          {
            send_message: {
              body: '詳細はこちら https://example.com/info'
            }
          }
        ],
        constraints: [
          { type: 'verified_domain', enabled: true }
        ]
      }
    ],
    constraints: {
      verified_domain: {
        enabled: true,
        allowed_domains: ['example.com'],
        action_on_unverified: 'reject'
      }
    }
  };

  const engine = createRuleEngine(spec);
  const result = engine.evaluate({
    event: 'cmd_detail',
    user: { tags: [] }
  });

  assert.equal(result.triggered.length, 1);
  assert.equal(result.violations.length, 0);
});

test('verified domain constraint blocks unapproved links', () => {
  const spec = {
    events: ['cmd_detail'],
    rules: [
      {
        id: 'detail_info',
        when: "event == 'cmd_detail'",
        do: [
          {
            send_message: {
              link: 'https://untrusted.example.net'
            }
          }
        ],
        constraints: [
          { type: 'verified_domain', enabled: true }
        ]
      }
    ],
    constraints: {
      verified_domain: {
        enabled: true,
        allowed_domains: ['trusted.example.com'],
        action_on_unverified: 'reject'
      }
    }
  };

  const engine = createRuleEngine(spec);
  const result = engine.evaluate({
    event: 'cmd_detail',
    user: { tags: [] }
  });

  assert.equal(result.triggered.length, 0);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].constraints[0].details.unverified[0].hostname, 'untrusted.example.net');
});

test('phi filter blocks sensitive text in payload', () => {
  const spec = {
    events: ['cmd_done'],
    rules: [
      {
        id: 'value_complete_invite',
        when: "event == 'cmd_done'",
        do: [
          {
            send_message: {
              body: 'おつかれさまです。次はこちらをご確認ください。'
            }
          }
        ],
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
      }
    }
  };

  const engine = createRuleEngine(spec);
  const result = engine.evaluate({
    event: 'cmd_done',
    payload: {
      text: '連絡先は test@example.com です'
    },
    user: { tags: [] }
  });

  assert.equal(result.triggered.length, 0);
  assert.equal(result.violations.length, 1);
  const violation = result.violations[0].constraints[0];
  assert.equal(violation.details.action, 'remove_and_warn');
  assert.ok(violation.details.matches.some((entry) => entry.sample === 'test@example.com'));
});
