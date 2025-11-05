#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'line_members';
const TARGET_RANGE = `${GOOGLE_SHEET_NAME}!A2:H`;

function normalizeSupabaseRecord(record = {}) {
  return {
    user_hash: record.user_hash ?? '',
    first_opt_in_at: record.first_opt_in_at ?? null,
    last_opt_in_at: record.last_opt_in_at ?? null,
    status: record.status ?? null,
    cta_tags: Array.isArray(record.cta_tags) ? record.cta_tags.map(String).sort() : [],
  };
}

function normalizeSheetRow(row = []) {
  const [userHash, firstOptIn, lastOptIn, status, ctaTags] = row;
  const clean = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return value;
  };
  let parsedTags = [];
  if (typeof ctaTags === 'string' && ctaTags.trim()) {
    try {
      const json = JSON.parse(ctaTags);
      if (Array.isArray(json)) {
        parsedTags = json.map(String).sort();
      }
    } catch {
      parsedTags = ctaTags.split(',').map((tag) => tag.trim()).filter(Boolean).sort();
    }
  }
  const cleanId = typeof userHash === 'string' ? userHash.trim() : userHash;
  return {
    user_hash: cleanId ?? '',
    first_opt_in_at: clean(firstOptIn),
    last_opt_in_at: clean(lastOptIn),
    status: clean(status),
    cta_tags: parsedTags,
  };
}

function diffLedgers(supabaseRecords = [], sheetRows = []) {
  const supabaseMap = new Map(
    supabaseRecords
      .map(normalizeSupabaseRecord)
      .filter((item) => item.user_hash)
      .map((item) => [item.user_hash, item]),
  );

  const sheetMap = new Map(
    sheetRows
      .map(normalizeSheetRow)
      .filter((item) => item.user_hash)
      .map((item) => [item.user_hash, item]),
  );

  const missingInSheets = [];
  const missingInSupabase = [];
  const differences = [];

  for (const [userHash, supRecord] of supabaseMap.entries()) {
    const sheetRecord = sheetMap.get(userHash);
    if (!sheetRecord) {
      missingInSheets.push(userHash);
      continue;
    }
    const fields = ['first_opt_in_at', 'last_opt_in_at', 'status'];
    const fieldDiffs = [];
    for (const field of fields) {
      const supValue = supRecord[field];
      const sheetValue = sheetRecord[field];
      if ((supValue ?? '') !== (sheetValue ?? '')) {
        fieldDiffs.push({ field, supabase: supValue, sheet: sheetValue });
      }
    }
    const supTags = supRecord.cta_tags.join(',');
    const sheetTags = sheetRecord.cta_tags.join(',');
    if (supTags !== sheetTags) {
      fieldDiffs.push({ field: 'cta_tags', supabase: supRecord.cta_tags, sheet: sheetRecord.cta_tags });
    }
    if (fieldDiffs.length > 0) {
      differences.push({ user_hash: userHash, fields: fieldDiffs });
    }
  }

  for (const userHash of sheetMap.keys()) {
    if (!supabaseMap.has(userHash)) {
      missingInSupabase.push(userHash);
    }
  }

  return {
    missingInSheets,
    missingInSupabase,
    differences,
  };
}

async function fetchSupabaseRecords() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are required');
  }
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/line_members?select=user_hash,first_opt_in_at,last_opt_in_at,status,cta_tags`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Supabase records: ${response.status} ${text}`);
  }
  return response.json();
}

async function getGoogleAccessToken() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON || !GOOGLE_SHEET_ID) {
    throw new Error('Google Sheets credentials (GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID) are required');
  }
  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  ).toString('base64url');
  const message = `${header}.${payload}`;
  const { createSign } = await import('node:crypto');
  const key = credentials.private_key.replace(/\\n/g, '\n');
  const signature = createSign('RSA-SHA256').update(message).sign(key).toString('base64url');
  const assertion = `${message}.${signature}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    throw new Error(`Failed to obtain Google access token: ${tokenResponse.status} ${text}`);
  }
  const json = await tokenResponse.json();
  return json.access_token;
}

async function fetchSheetRows(token) {
  const range = encodeURIComponent(TARGET_RANGE);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${range}?majorDimension=ROWS`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Google Sheet: ${response.status} ${text}`);
  }
  const result = await response.json();
  return result.values || [];
}

async function main() {
  try {
    const [supabaseRecords, sheetAccessToken] = await Promise.all([
      fetchSupabaseRecords(),
      getGoogleAccessToken(),
    ]);
    const sheetRows = await fetchSheetRows(sheetAccessToken);
    const diff = diffLedgers(supabaseRecords, sheetRows);

    const summary = {
      supabase_count: supabaseRecords.length,
      sheet_count: sheetRows.length,
      missing_in_sheets: diff.missingInSheets.length,
      missing_in_supabase: diff.missingInSupabase.length,
      differences: diff.differences.length,
    };

    console.log(JSON.stringify({ summary, detail: diff }, null, 2));

    if (
      diff.missingInSheets.length > 0 ||
      diff.missingInSupabase.length > 0 ||
      diff.differences.length > 0
    ) {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error('Failed to reconcile ledgers:', error.message ?? error);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (executedPath && executedPath === import.meta.url) {
  main();
}

export {
  diffLedgers,
  normalizeSheetRow,
  normalizeSupabaseRecord,
};
