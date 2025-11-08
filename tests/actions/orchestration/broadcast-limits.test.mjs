import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateBroadcastPolicy } from '../../../scripts/orchestration/broadcast-limits.mjs';

test('allows broadcast when under monthly limit', () => {
  const result = evaluateBroadcastPolicy({
    metadata: { broadcast_month_key: '2025-11', broadcast_count_month: 1 },
    templateNames: ['scenario_cmd_detail'],
    now: new Date('2025-11-06T00:00:00Z'),
    config: { maxPerMonth: 3 }
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'ok');
  assert.equal(result.metadataPatch.broadcast_count_month, 2);
});

test('blocks broadcast when exceeding monthly limit', () => {
  const result = evaluateBroadcastPolicy({
    metadata: { broadcast_month_key: '2025-11', broadcast_count_month: 3 },
    templateNames: ['scenario_cmd_detail'],
    now: new Date('2025-11-06T00:00:00Z'),
    config: { maxPerMonth: 3 }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'monthly_limit');
});

test('blocks promo template within cooldown window', () => {
  const result = evaluateBroadcastPolicy({
    metadata: { promo_last_sent_at: '2025-10-20T00:00:00Z' },
    templateNames: ['scenario_cmd_gift'],
    now: new Date('2025-10-25T00:00:00Z'),
    config: { promoCooldownDays: 30 }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'promo_cooldown');
});

test('allows promo after cooldown window', () => {
  const result = evaluateBroadcastPolicy({
    metadata: { promo_last_sent_at: '2025-09-01T00:00:00Z' },
    templateNames: ['scenario_cmd_gift'],
    now: new Date('2025-10-25T00:00:00Z'),
    config: { promoCooldownDays: 30 }
  });
  assert.equal(result.allowed, true);
  assert.ok(result.metadataPatch.promo_last_sent_at);
});

test('resets monthly counter when month changes', () => {
  const result = evaluateBroadcastPolicy({
    metadata: { broadcast_month_key: '2025-10', broadcast_count_month: 3 },
    templateNames: ['scenario_cmd_detail'],
    now: new Date('2025-11-01T00:00:00Z'),
    config: { maxPerMonth: 3 }
  });
  assert.equal(result.allowed, true);
  assert.equal(result.metadataPatch.broadcast_count_month, 1);
});
