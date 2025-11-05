#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'line_members';
const EVENT_PATH = process.argv[2];

if (!SERVICE_ACCOUNT_JSON || !SHEET_ID) {
  console.warn('⚠️ Google Sheets credentials or sheet ID not provided. Skipping update.');
  process.exit(0);
}

if (!EVENT_PATH) {
  console.error('Usage: node scripts/sheets/upsert-line-member.js <event-json-path>');
  process.exit(1);
}

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken(credentials) {
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

const START_COLUMN = 'A';
const DEFAULT_COLUMN_COUNT = 8;

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

async function fetchExistingValues(token, columns) {
  const targetRange = columns || `${START_COLUMN}:${resolveLastColumn()}`;
  const range = encodeURIComponent(`${SHEET_NAME}!${targetRange}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?majorDimension=ROWS`;
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

async function updateRow(token, rowIndex, values) {
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

async function appendRow(token, values) {
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

async function ensureHeader(token) {
  const existing = await fetchExistingValues(token, buildRange(1, 1));
  if (existing.length === 0 || existing[0].length === 0) {
    await updateRow(token, 1, [
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

function parseEvents(path) {
  const raw = readFileSync(path, 'utf-8');
  const json = JSON.parse(raw);
  if (!Array.isArray(json.events)) {
    return [];
  }
  return json.events.map((event) => {
    const timestamp = event.timestamp
      ? new Date(Number(event.timestamp)).toISOString()
      : new Date().toISOString();
    const status = deriveStatus(event.type || 'unknown');
    return {
      userId: event.source?.userId || '',
      eventType: event.type || 'unknown',
      timestamp,
      messageText: event.message?.text || '',
      status,
      raw: event,
    };
  });
}

function deriveStatus(eventType) {
  switch (eventType) {
    case 'follow':
      return 'active';
    case 'unfollow':
      return 'churned';
    case 'message':
      return 'engaged';
    default:
      return 'lead';
  }
}

async function main() {
  const credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
  const accessToken = await getAccessToken(credentials);
  await ensureHeader(accessToken);
  const existing = await fetchExistingValues(
    accessToken,
    `${START_COLUMN}2:${resolveLastColumn()}`,
  );

  const existingMap = new Map();
  existing.forEach((row, index) => {
    if (row[0]) {
      existingMap.set(row[0], {
        rowIndex: index + 2,
        values: row,
      });
    }
  });

  const events = parseEvents(EVENT_PATH);
  for (const event of events) {
    if (!event.userId) {
      continue;
    }
    const values = [
      event.userId,
      event.timestamp,
      event.timestamp,
      event.status,
      JSON.stringify(event.raw.tags ?? []),
      event.messageText,
      event.eventType,
      JSON.stringify(event.raw),
    ];

    const existingRow = existingMap.get(event.userId);
    if (existingRow) {
      const firstOptIn = existingRow.values[1] || values[1];
      values[1] = firstOptIn;
      await updateRow(accessToken, existingRow.rowIndex, values);
    } else {
      await appendRow(accessToken, values);
    }
  }
}

export { main };
