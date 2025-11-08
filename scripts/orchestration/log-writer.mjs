#!/usr/bin/env node
/**
 * Write LINE reply log entries into Supabase event_logs table.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveSupabaseConfig } from '../vendor/supabase/upsert-progress-event.js';

function printUsage() {
  console.log(`Usage:
  node scripts/orchestration/log-writer.mjs --input <log-json>

Options:
  --input   Path to JSON file containing { entries: [] } or an array`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input') {
      args.input = argv[++i];
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }
  return args;
}

function loadEntries(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(content)) {
    return content;
  }
  if (Array.isArray(content.entries)) {
    return content.entries;
  }
  return [];
}

export async function writeLogs(entries = [], options = {}) {
  const env = options.env ?? process.env;
  const { supabaseUrl, serviceRoleKey } = resolveSupabaseConfig(env);
  if (!supabaseUrl || !serviceRoleKey) {
    return { skipped: true, reason: 'missing_supabase_credentials' };
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return { skipped: true, reason: 'empty_entries' };
  }
  const rows = entries.map((entry) => ({
    log_type: entry.log_type ?? 'line_reply',
    event_id: entry.event_id ?? null,
    user_hash: entry.user_hash ?? null,
    payload: entry,
    created_at: entry.timestamp ?? new Date().toISOString()
  }));
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/event_logs`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to write event logs (${response.status}): ${text}`);
  }
  return { inserted: rows.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  const inputPath = args.input ? path.resolve(args.input) : null;
  if (!inputPath) {
    printUsage();
    throw new Error('--input is required');
  }
  if (!fs.existsSync(inputPath)) {
    console.log(`ℹ️ Reply log not found at ${inputPath}. Skipping.`);
    return;
  }
  const entries = loadEntries(inputPath);
  const result = await writeLogs(entries);
  if (result.skipped) {
    console.log(`ℹ️ Reply log write skipped (${result.reason})`);
  } else {
    console.log(`✓ Inserted ${result.inserted} event log entries.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
