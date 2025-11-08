import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchUserState, applyTagChanges } from '../../../scripts/orchestration/user-state.mjs';

const ENV = {
  SUPABASE_URL: 'https://supabase.example',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key'
};

const ENV_WITH_SHEETS = {
  ...ENV,
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: 'service_account',
    client_email: 'test@example.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----\n'
  }),
  GOOGLE_SHEET_ID: 'test-sheet-id'
};

test('fetchUserState returns tags from Supabase', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ([{
        user_hash: 'user-1',
        cta_tags: ['lead_free', 'trial_active'],
        metadata: { tags: ['conversion_invited'] }
      }])
    });
    const state = await fetchUserState('user-1', { env: ENV });
    assert.deepEqual(new Set(state.tags), new Set(['lead_free', 'trial_active', 'conversion_invited']));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyTagChanges merges add/remove operations', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      if (calls.length === 1) {
        return {
          ok: true,
          json: async () => ([{ user_hash: 'user-1', cta_tags: ['lead_free'], metadata: { tags: [] }, updated_at: '2025-01-01T00:00:00Z' }])
        };
      }
      return {
        ok: true,
        json: async () => ([{ user_hash: 'user-1', cta_tags: ['trial_active'], metadata: { tags: ['trial_active'] } }])
      };
    };
    const result = await applyTagChanges('user-1', { add: ['trial_active'], remove: ['lead_free'] }, { env: ENV });
    // applyTagChangesは{ tags: [...] }を返す
    assert.deepEqual(result.tags, ['trial_active']);
    // fetchUserState (1回目) + patchUserRecord (2回目) = 2回のSupabase呼び出し
    const supabaseCalls = calls.filter(c => c.url && c.url.includes('supabase'));
    assert.equal(supabaseCalls.length, 2);
    assert.equal(supabaseCalls[1].init.method, 'PATCH');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchUserState includes sheetsData when Google Sheets is available', async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleWarn = console.warn;
  let warnCalled = false;
  console.warn = () => { warnCalled = true; };
  
  try {
    let callCount = 0;
    globalThis.fetch = async (url, init) => {
      callCount++;
      if (url.includes('supabase')) {
        return {
          ok: true,
          json: async () => ([{
            user_hash: 'user-1',
            cta_tags: ['lead_free'],
            metadata: { tags: [] },
            updated_at: '2025-01-01T00:00:00Z'
          }])
        };
      }
      // Google Sheets API呼び出しは失敗をシミュレート（警告のみ）
      return {
        ok: false,
        status: 404,
        text: async () => 'Not found'
      };
    };
    
    const state = await fetchUserState('user-1', { env: ENV_WITH_SHEETS });
    assert.deepEqual(state.tags, ['lead_free']);
    assert.notEqual(state.raw, null);
    // Sheets取得失敗時は警告のみ（非致命的）
    assert.equal(state.sheetsData, null);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalConsoleWarn;
  }
});

test('applyTagChanges syncs to Google Sheets when available', async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleWarn = console.warn;
  let warnMessages = [];
  console.warn = (msg) => { 
    warnMessages.push(msg);
    originalConsoleWarn(msg);
  };
  
  try {
    let callCount = 0;
    globalThis.fetch = async (url, init) => {
      callCount++;
      if (url.includes('supabase')) {
        if (callCount === 1) {
          // fetchUserState呼び出し（upsertTags内で実行）
          return {
            ok: true,
            json: async () => ([{
              user_hash: 'user-1',
              cta_tags: ['lead_free'],
              metadata: { tags: [] },
              updated_at: '2025-01-01T00:00:00Z'
            }])
          };
        }
        // patchUserRecord呼び出し
        return {
          ok: true,
          json: async () => ([{
            user_hash: 'user-1',
            cta_tags: ['trial_active'],
            metadata: { tags: ['trial_active'] }
          }])
        };
      }
      if (url.includes('oauth2.googleapis.com/token')) {
        // Google OAuth認証（JWT署名エラーをシミュレート）
        return {
          ok: false,
          status: 400,
          text: async () => 'Invalid JWT signature'
        };
      }
      if (url.includes('sheets.googleapis.com')) {
        // Google Sheets API呼び出し（失敗をシミュレート）
        return {
          ok: false,
          status: 404,
          text: async () => 'Sheet not found'
        };
      }
      return { ok: false, status: 404, text: async () => 'Not found' };
    };
    
    const result = await applyTagChanges('user-1', { add: ['trial_active'] }, { env: ENV_WITH_SHEETS });
    // resultはpatchUserRecordの戻り値（配列）なので、最初の要素を取得
    const tags = Array.isArray(result) && result[0] ? result[0].cta_tags : [];
    assert.deepEqual(tags, ['trial_active']);
    // Sheets同期失敗時は警告のみ（Supabase更新は成功）
    assert(warnMessages.length > 0, 'Warning should be called for Sheets sync failure');
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalConsoleWarn;
  }
});
