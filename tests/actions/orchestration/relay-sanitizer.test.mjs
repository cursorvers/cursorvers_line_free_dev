import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashUserId,
  detectEventType,
  sanitizePayload,
  createDedupKey,
  resolveDedupeTtl,
} from '../../../scripts/orchestration/relay-sanitizer.mjs';

const sampleLinePayload = {
  destination: 'line-bot',
  events: [
    {
      type: 'message',
      timestamp: 1731043200000,
      replyToken: 'r-token',
      source: { type: 'user', userId: 'Uxxxx' },
      message: { type: 'text', id: 'mid', text: 'こんにちは' }
    }
  ]
};

test('hashUserId is deterministic and salted', () => {
  const salted = hashUserId('user', 'salt');
  const saltedAgain = hashUserId('user', 'salt');
  const unsalted = hashUserId('user');
  assert.equal(salted, saltedAgain);
  assert.notEqual(salted, unsalted);
  assert.equal(salted.length, 16);
});

test('detectEventType differentiates LINE and Manus payloads', () => {
  assert.equal(detectEventType(sampleLinePayload), 'line_event');
  assert.equal(detectEventType({ progress_id: 'p1' }), 'manus_progress');
  assert.equal(detectEventType({}), 'unknown');
});

test('sanitizePayload redacts text when instructed', () => {
  const sanitized = sanitizePayload(sampleLinePayload, 'line_event', {
    hashSalt: 'salt',
    redactLineMessage: true,
    deriveLineEvent: () => ({ eventName: 'cmd_detail', command: 'detail' })
  });
  assert.equal(sanitized.event, 'cmd_detail');
  assert.equal(sanitized.command, 'detail');
  assert.equal(sanitized.events[0].message.text, '[redacted]');
  assert.equal(sanitized.events[0].message.raw_text, null);
  assert.equal(sanitized.user.hashed_id.length, 16);
});

test('sanitizePayload preserves raw text when not redacting', () => {
  const sanitized = sanitizePayload(sampleLinePayload, 'line_event', {
    hashSalt: 'salt',
    deriveLineEvent: () => ({ eventName: 'cmd_detail', command: null })
  });
  assert.equal(sanitized.events[0].message.text, 'こんにちは');
  assert.equal(sanitized.events[0].message.raw_text, 'こんにちは');
});

test('createDedupKey reflects payload characteristics', () => {
  const keyA = createDedupKey('line_event', sampleLinePayload, { hashSalt: 'salt' });
  const keyB = createDedupKey('line_event', sampleLinePayload, { hashSalt: 'different' });
  assert.notEqual(keyA, keyB, 'salt should affect hash');

  const manusKey = createDedupKey('manus_progress', { progress_id: 'p1', decision: 'ok' }, {});
  assert.equal(manusKey.length, 64);
});

test('resolveDedupeTtl handles invalid values gracefully', () => {
  assert.equal(resolveDedupeTtl('300', 120), 300);
  assert.equal(resolveDedupeTtl(undefined, 120), 120);
  assert.equal(resolveDedupeTtl('abc', 60), 60);
});
