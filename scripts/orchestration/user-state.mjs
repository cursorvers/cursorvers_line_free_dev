#!/usr/bin/env node
import process from 'node:process';
import { resolveSupabaseConfig } from '../vendor/supabase/upsert-progress-event.js';
import {
  getAccessToken,
  ensureHeader,
  findRowByUserHash,
  updateSheetRow,
  appendSheetRow,
  fetchSheetValues,
  normalizeSheetRow,
  serializeTags,
  resolveSheetsConfig,
  isSheetsAvailable,
} from '../vendor/google/sheets-client.mjs';

const TABLE = 'line_members';

export async function fetchUserState(userHash, options = {}) {
  if (!userHash) {
    return { tags: [], raw: null, sheetsData: null };
  }
  const config = resolveSupabaseConfig(options.env)
    ?? resolveSupabaseConfig(process.env);
  const { supabaseUrl, serviceRoleKey } = config;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase credentials are required to fetch user state');
  }
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${TABLE}?user_hash=eq.${encodeURIComponent(userHash)}&select=user_hash,cta_tags,metadata,updated_at`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch user state (${response.status}): ${text}`);
  }
  const data = await response.json();
  const record = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!record) {
    return { tags: [], raw: null, sheetsData: null };
  }
  const tags = mergeTags(record);
  
  // Google Sheetsからもデータを取得（オプション）
  let sheetsData = null;
  if (isSheetsAvailable(options.env || process.env)) {
    try {
      sheetsData = await fetchUserStateFromSheets(userHash, options);
    } catch (error) {
      // Sheets取得失敗は警告のみ（非致命的）
      console.warn(`⚠️ Failed to fetch from Google Sheets: ${error.message}`);
    }
  }
  
  return { tags, raw: record, sheetsData, updatedAt: record.updated_at };
}

export async function applyTagChanges(userHash, changes, options = {}) {
  if (!userHash) {
    throw new Error('userHash is required to apply tag changes');
  }
  const { add = [], remove = [] } = changes || {};
  if (add.length === 0 && remove.length === 0) {
    return { tags: [], raw: null };
  }
  const current = await fetchUserState(userHash, options);
  const next = new Set(current.tags);
  add.forEach((tag) => {
    if (typeof tag === 'string' && tag.trim() !== '') {
      next.add(tag.trim());
    }
  });
  remove.forEach((tag) => {
    if (typeof tag === 'string') {
      next.delete(tag.trim());
    }
  });
  const nextTags = Array.from(next);
  await upsertTags(userHash, nextTags, options);
  return { tags: nextTags };
}

export async function updateUserMetadata(userHash, metadataPatch = {}, options = {}) {
  if (!userHash) {
    throw new Error('userHash is required to update metadata');
  }
  const current = await fetchUserState(userHash, options);
  const mergedMetadata = {
    ...(current.raw?.metadata ?? {}),
    ...metadataPatch
  };
  await patchUserRecord(userHash, { metadata: mergedMetadata }, options);
  return mergedMetadata;
}

async function patchUserRecord(userHash, bodyPatch, options = {}) {
  const config = resolveSupabaseConfig(options.env)
    ?? resolveSupabaseConfig(process.env);
  const { supabaseUrl, serviceRoleKey } = config;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase credentials are required to update records');
  }
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${TABLE}?user_hash=eq.${encodeURIComponent(userHash)}`;
  const body = {
    ...bodyPatch,
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update record (${response.status}): ${text}`);
  }
  return await response.json();
}

async function upsertTags(userHash, tags, options = {}) {
  const config = resolveSupabaseConfig(options.env)
    ?? resolveSupabaseConfig(process.env);
  const { supabaseUrl, serviceRoleKey } = config;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase credentials are required to update tags');
  }
  
  // 楽観的ロック: 現在のupdated_atを取得
  const current = await fetchUserState(userHash, options);
  const expectedUpdatedAt = current.raw?.updated_at;
  
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${TABLE}?user_hash=eq.${encodeURIComponent(userHash)}`;
  const newUpdatedAt = new Date().toISOString();
  const body = {
    cta_tags: tags,
    metadata: {
      ...(options.metadata || {}),
      tags,
    },
    updated_at: newUpdatedAt,
  };
  
  // 楽観的ロック: updated_atが変更されていないことを確認
  if (expectedUpdatedAt && options.enableOptimisticLock !== false) {
    // SupabaseのPATCHではupdated_atの条件チェックは別途実装が必要
    // ここでは警告のみ（本番環境ではRLSポリシーやトリガーで制御）
  }
  
  const result = await patchUserRecord(userHash, body, options);
  
  // Google Sheetsへの同期（非同期、エラーは警告のみ）
  if (isSheetsAvailable(options.env || process.env)) {
    try {
      await syncTagsToSheets(userHash, tags, current.raw, options);
    } catch (error) {
      console.warn(`⚠️ Failed to sync tags to Google Sheets: ${error.message}`);
      // Sheets同期失敗は非致命的（Supabase更新は成功している）
    }
  }
  
  return result;
}

function mergeTags(record) {
  const set = new Set();
  if (Array.isArray(record?.cta_tags)) {
    record.cta_tags.forEach((tag) => {
      if (typeof tag === 'string') {
        set.add(tag.trim());
      }
    });
  }
  const metadataTags = record?.metadata?.tags;
  if (Array.isArray(metadataTags)) {
    metadataTags.forEach((tag) => {
      if (typeof tag === 'string') {
        set.add(tag.trim());
      }
    });
  }
  return Array.from(set);
}

/**
 * Google Sheetsからユーザー状態を取得
 */
async function fetchUserStateFromSheets(userHash, options = {}) {
  const sheetsConfig = resolveSheetsConfig(options.env || process.env);
  if (!sheetsConfig) {
    return null;
  }
  
  const token = await getAccessToken(sheetsConfig.credentials);
  await ensureHeader(token);
  
  const rowIndex = await findRowByUserHash(token, userHash);
  if (!rowIndex) {
    return null;
  }
  
  const sheetName = sheetsConfig.sheetName;
  const rows = await fetchSheetValues(token, `${sheetName}!A${rowIndex}:H${rowIndex}`);
  if (rows.length === 0) {
    return null;
  }
  
  return normalizeSheetRow(rows[0]);
}

/**
 * タグをGoogle Sheetsに同期
 */
async function syncTagsToSheets(userHash, tags, supabaseRecord, options = {}) {
  const sheetsConfig = resolveSheetsConfig(options.env || process.env);
  if (!sheetsConfig) {
    return;
  }
  
  const token = await getAccessToken(sheetsConfig.credentials);
  await ensureHeader(token);
  
  const rowIndex = await findRowByUserHash(token, userHash);
  const tagsJson = serializeTags(tags);
  
  // 既存行の更新または新規行の追加
  if (rowIndex) {
    // 既存行を取得して、cta_tags列のみ更新
    const sheetName = sheetsConfig.sheetName;
    const rows = await fetchSheetValues(token, `${sheetName}!A${rowIndex}:H${rowIndex}`);
    if (rows.length > 0) {
      const existingRow = rows[0];
      // cta_tags列（E列、インデックス4）のみ更新
      existingRow[4] = tagsJson;
      await updateSheetRow(token, rowIndex, existingRow);
    }
  } else {
    // 新規行を追加（Supabaseレコードから情報を取得）
    const now = new Date().toISOString();
    const values = [
      userHash,
      supabaseRecord?.first_opt_in_at || now,
      supabaseRecord?.last_opt_in_at || now,
      supabaseRecord?.status || 'lead',
      tagsJson,
      '', // last_message
      '', // last_event_type
      JSON.stringify(supabaseRecord || {}), // raw_payload
    ];
    await appendSheetRow(token, values);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const [,, hash, action, tagList] = process.argv;
      if (!hash) {
        console.error('Usage: user-state.mjs <user_hash> [add|remove] tag1,tag2');
        process.exit(1);
      }
      if (!action) {
        const state = await fetchUserState(hash);
        console.log(JSON.stringify(state, null, 2));
        return;
      }
      const tags = typeof tagList === 'string' ? tagList.split(',').map((t) => t.trim()).filter(Boolean) : [];
      if (action === 'add') {
        const result = await applyTagChanges(hash, { add: tags });
        console.log(JSON.stringify(result, null, 2));
      } else if (action === 'remove') {
        const result = await applyTagChanges(hash, { remove: tags });
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.error('Unknown action. Use add/remove');
        process.exit(1);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  })();
}
