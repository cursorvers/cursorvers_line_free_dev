import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diffLedgers,
  normalizeSheetRow,
  normalizeSupabaseRecord,
} from '../../scripts/reconcile-ledgers.js';

test('normalizeSupabaseRecord fills defaults and sorts tags', () => {
  const record = normalizeSupabaseRecord({
    user_hash: 'abc',
    first_opt_in_at: '2024-01-01T00:00:00Z',
    cta_tags: ['b', 'a'],
  });
  assert.deepEqual(record, {
    user_hash: 'abc',
    first_opt_in_at: '2024-01-01T00:00:00Z',
    last_opt_in_at: null,
    status: null,
    cta_tags: ['a', 'b'],
  });
});

test('normalizeSheetRow parses json tags and defaults missing values', () => {
  const row = normalizeSheetRow(['abc', '2024-01-01', '', 'lead', JSON.stringify(['beta', 'alpha'])]);
  assert.deepEqual(row, {
    user_hash: 'abc',
    first_opt_in_at: '2024-01-01',
    last_opt_in_at: null,
    status: 'lead',
    cta_tags: ['alpha', 'beta'],
  });
});

test('normalizeSheetRow falls back to comma separated tags', () => {
  const row = normalizeSheetRow(['abc', null, null, 'lead', 'delta,gamma']);
  assert.deepEqual(row.cta_tags, ['delta', 'gamma']);
});

test('diffLedgers highlights missing and mismatched records', () => {
  const supabaseRecords = [
    {
      user_hash: 'user-1',
      first_opt_in_at: '2024-01-01T00:00:00Z',
      last_opt_in_at: null,
      status: 'lead',
      cta_tags: ['alpha'],
    },
    {
      user_hash: 'user-2',
      first_opt_in_at: '2024-01-02T00:00:00Z',
      last_opt_in_at: null,
      status: 'active',
      cta_tags: ['beta'],
    },
  ];
  const sheetRows = [
    ['user-1', '2024-01-01T00:00:00Z', '', 'lead', JSON.stringify(['alpha'])],
    ['user-3', '2024-01-03T00:00:00Z', '', 'lead', JSON.stringify(['gamma'])],
  ];
  const diff = diffLedgers(supabaseRecords, sheetRows);
  assert.deepEqual(diff.missingInSheets, ['user-2']);
  assert.deepEqual(diff.missingInSupabase, ['user-3']);
  assert.equal(diff.differences.length, 0);
});

test('diffLedgers captures field and tag discrepancies', () => {
  const supabaseRecords = [
    {
      user_hash: 'user-1',
      first_opt_in_at: '2024-01-01T00:00:00Z',
      last_opt_in_at: null,
      status: 'active',
      cta_tags: ['alpha', 'beta'],
    },
  ];
  const sheetRows = [
    ['user-1', '2024-01-02T00:00:00Z', '', 'lead', JSON.stringify(['beta'])],
  ];
  const diff = diffLedgers(supabaseRecords, sheetRows);
  assert.equal(diff.differences.length, 1);
  const fields = diff.differences[0].fields;
  assert.deepEqual(
    fields.map((f) => f.field).sort(),
    ['cta_tags', 'first_opt_in_at', 'status'].sort(),
  );
});
