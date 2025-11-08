import assert from 'node:assert/strict';
import test from 'node:test';
import { processNoteEvent } from '../../../scripts/orchestration/handle-note-event.mjs';

const BASE_ENV = {
  SUPABASE_URL: 'https://supabase.example',
  SUPABASE_SERVICE_ROLE_KEY: 'supabase-key'
};

test('processNoteEvent applies tag operations and updates webhook status', async () => {
  const payload = {
    note_event_id: 'note-1',
    event_type: 'viewed_note',
    user_hash: 'user-123'
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (url.includes('note_webhooks') && (!init.method || init.method === 'POST')) {
      return { ok: true, text: async () => '' };
    }
    if (url.includes('note_webhooks') && init.method === 'PATCH') {
      return { ok: true, text: async () => '' };
    }
    if (url.includes('line_members')) {
      if (!init.method || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ([{ user_hash: 'user-123', cta_tags: ['lead_free'], metadata: { tags: [] }, updated_at: '2025-01-01T00:00:00Z' }])
        };
      }
      return {
        ok: true,
        json: async () => ([{ user_hash: 'user-123', cta_tags: ['lead_free', 'note_viewed'], metadata: { tags: ['note_viewed'] } }])
      };
    }
    return { ok: true, json: async () => ({}) };
  };
  
  const engine = {
    evaluate() {
      return {
        triggered: [
          {
            operations: [
              {
                type: 'tag',
                payload: { add: ['note_viewed'] }
              }
            ]
          }
        ],
        violations: []
      };
    }
  };

  const result = await processNoteEvent({ payload, env: BASE_ENV, engine });
  assert.equal(result.triggered, 1);
  globalThis.fetch = originalFetch;
});

test('processNoteEvent records error status when evaluation fails', async () => {
  const payload = {
    note_event_id: 'note-err',
    event_type: 'viewed_note',
    user_hash: 'user-999'
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (url.includes('note_webhooks') && (!init.method || init.method === 'POST')) {
      return { ok: true, text: async () => '' };
    }
    if (url.includes('note_webhooks') && init.method === 'PATCH') {
      return { ok: true, text: async () => '' };
    }
    if (url.includes('line_members')) {
      return { ok: false, status: 500, text: async () => 'boom' };
    }
    return { ok: true, json: async () => ({}) };
  };

  let threw = false;
  try {
    await processNoteEvent({ payload, env: BASE_ENV, engine: { evaluate() { return { triggered: [] }; } } });
  } catch (error) {
    threw = true;
  }
  assert.equal(threw, true);
  globalThis.fetch = originalFetch;
});
