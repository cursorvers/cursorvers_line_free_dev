#!/usr/bin/env node
/**
 * Google Sheets Client Module
 * 
 * Google Sheets APIへの認証と基本的な操作を提供するモジュール。
 * User Tag State Serviceから利用される。
 */

const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'line_members';

const START_COLUMN = 'A';
const DEFAULT_COLUMN_COUNT = 8;

// 列マッピング: 列名 -> 列インデックス (0-based)
const COLUMN_MAP = {
  user_hash: 0,        // A
  first_opt_in_at: 1,  // B
  last_opt_in_at: 2,   // C
  status: 3,           // D
  cta_tags: 4,         // E
  last_message: 5,     // F
  last_event_type: 6,  // G
  raw_payload: 7,      // H
};

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Google Service Account JSONからアクセストークンを取得
 */
export async function getAccessToken(credentials) {
  const headers = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  );

  const message = `${base64url(headers)}.${base64url(payload)}`;
  const sign = await import('node:crypto');
  const key = credentials.private_key.replace(/\\n/g, '\n');
  const signature = sign.createSign('RSA-SHA256').update(message).sign(key);
  const jwt = `${message}.${base64url(signature)}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to obtain access token: ${response.status} ${text}`);
  }

  const json = await response.json();
  return json.access_token;
}

function resolveLastColumn(columnCount = DEFAULT_COLUMN_COUNT) {
  const clamped = Math.max(1, columnCount);
  const startCode = START_COLUMN.charCodeAt(0);
  return String.fromCharCode(startCode + clamped - 1);
}

function buildRange(rowStart, rowEnd, columnCount = DEFAULT_COLUMN_COUNT) {
  const lastColumn = resolveLastColumn(columnCount);
  if (rowStart && rowEnd) {
    return `${SHEET_NAME}!${START_COLUMN}${rowStart}:${lastColumn}${rowEnd}`;
  }
  return `${SHEET_NAME}!${START_COLUMN}:${lastColumn}`;
}

/**
 * Google Sheetsから既存の値を取得
 */
export async function fetchSheetValues(token, range) {
  const encodedRange = encodeURIComponent(range || buildRange(1, 1));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodedRange}?majorDimension=ROWS`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    const text = await response.text();
    throw new Error(`Failed to read sheet values: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.values || [];
}

/**
 * Google Sheetsの特定行を更新
 */
export async function updateSheetRow(token, rowIndex, values) {
  const range = buildRange(rowIndex, rowIndex, values.length);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: [values],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update row ${rowIndex}: ${response.status} ${text}`);
  }
}

/**
 * Google Sheetsに新しい行を追加
 */
export async function appendSheetRow(token, values) {
  const range = buildRange(null, null, values.length);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: [values],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to append row: ${response.status} ${text}`);
  }
}

/**
 * ヘッダー行を確保（存在しない場合に作成）
 */
export async function ensureHeader(token) {
  const existing = await fetchSheetValues(token, buildRange(1, 1));
  if (existing.length === 0 || existing[0].length === 0) {
    await updateSheetRow(token, 1, [
      'user_hash',
      'first_opt_in_at',
      'last_opt_in_at',
      'status',
      'cta_tags',
      'last_message',
      'last_event_type',
      'raw_payload',
    ]);
  }
}

/**
 * user_hashで行を検索して行インデックスを返す
 * @returns {number|null} 行インデックス（1-based、見つからない場合はnull）
 */
export async function findRowByUserHash(token, userHash) {
  // データ行のみ取得（ヘッダー行をスキップ）
  const range = `${SHEET_NAME}!A2:${resolveLastColumn()}`;
  const allRows = await fetchSheetValues(token, range);
  for (let i = 0; i < allRows.length; i++) {
    if (allRows[i] && allRows[i][COLUMN_MAP.user_hash] === userHash) {
      return i + 2; // 1-based index (header is row 1, data starts at row 2)
    }
  }
  return null;
}

/**
 * 行データを正規化（配列からオブジェクトへ）
 */
export function normalizeSheetRow(row = []) {
  return {
    user_hash: row[COLUMN_MAP.user_hash] || '',
    first_opt_in_at: row[COLUMN_MAP.first_opt_in_at] || null,
    last_opt_in_at: row[COLUMN_MAP.last_opt_in_at] || null,
    status: row[COLUMN_MAP.status] || null,
    cta_tags: parseTags(row[COLUMN_MAP.cta_tags]),
    last_message: row[COLUMN_MAP.last_message] || null,
    last_event_type: row[COLUMN_MAP.last_event_type] || null,
    raw_payload: row[COLUMN_MAP.raw_payload] || null,
  };
}

/**
 * タグ文字列を配列にパース
 */
function parseTags(tagString) {
  if (!tagString || typeof tagString !== 'string') {
    return [];
  }
  try {
    const json = JSON.parse(tagString);
    if (Array.isArray(json)) {
      return json.map(String).sort();
    }
  } catch {
    // JSONパース失敗時はカンマ区切りとして扱う
    return tagString.split(',').map((tag) => tag.trim()).filter(Boolean).sort();
  }
  return [];
}

/**
 * タグ配列を文字列にシリアライズ
 */
export function serializeTags(tags) {
  if (!Array.isArray(tags)) {
    return JSON.stringify([]);
  }
  return JSON.stringify(tags.map(String).sort());
}

/**
 * Google Sheets設定を解決
 */
export function resolveSheetsConfig(env = process.env) {
  const serviceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = env.GOOGLE_SHEET_ID;
  const sheetName = env.GOOGLE_SHEET_NAME || 'line_members';

  if (!serviceAccountJson || !sheetId) {
    return null;
  }

  try {
    const credentials = JSON.parse(serviceAccountJson);
    return {
      credentials,
      sheetId,
      sheetName,
    };
  } catch (error) {
    throw new Error(`Invalid GOOGLE_SERVICE_ACCOUNT_JSON: ${error.message}`);
  }
}

/**
 * Google Sheetsが利用可能かチェック
 */
export function isSheetsAvailable(env = process.env) {
  return !!(env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GOOGLE_SHEET_ID);
}

