#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadRuleEngine } from './execute-rules.mjs';
import { fetchUserState, applyTagChanges } from './user-state.mjs';
import { resolveSupabaseConfig } from '../vendor/supabase/upsert-progress-event.js';

function printUsage() {
  console.log(`Usage:
  node scripts/orchestration/handle-note-event.mjs --event <path> [--spec codex.spec.yaml]`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--event') {
      args.eventPath = argv[++i];
    } else if (token === '--spec') {
      args.specPath = argv[++i];
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }
  return args;
}

function loadPayload(filePath) {
  if (!filePath) throw new Error('--event is required');
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Event payload not found: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function mapEventType(type) {
  if (!type) return null;
  if (type.startsWith('note_')) return type;
  switch (type) {
    case 'viewed_note':
      return 'note_viewed';
    case 'payment_completed':
      return 'note_payment_completed';
    default:
      return `note_${type}`;
  }
}

async function upsertNoteWebhookRecord(payload, supabaseConfig, statusPatch = {}) {
  const { supabaseUrl, serviceRoleKey } = supabaseConfig;
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/note_webhooks`;
  const record = {
    note_event_id: payload.note_event_id,
    event_type: payload.event_type,
    note_user_id: payload.note_user_id ?? null,
    user_hash: payload.user_hash ?? null,
    payload,
    dedupe_key: payload.dedupe_key ?? payload.note_event_id,
    status: statusPatch.status ?? 'pending',
    received_at: payload.received_at ?? new Date().toISOString(),
    ...(statusPatch.patch ?? {})
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(record)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upsert note_webhooks (${response.status}): ${text}`);
  }
}

async function updateWebhookStatus(noteEventId, supabaseConfig, patch) {
  const { supabaseUrl, serviceRoleKey } = supabaseConfig;
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/note_webhooks?note_event_id=eq.${encodeURIComponent(noteEventId)}`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update note_webhooks (${response.status}): ${text}`);
  }
}

function extractTagsOperation(operation) {
  if (!operation || operation.type !== 'tag') return null;
  const add = Array.isArray(operation.payload?.add) ? operation.payload.add : [];
  const remove = Array.isArray(operation.payload?.remove) ? operation.payload.remove : [];
  return { add, remove };
}

function logUnsupported(operation) {
  console.warn(`⚠️ Unsupported note action type: ${operation.type}`);
}

export async function processNoteEvent(options = {}) {
  const { payload, env = process.env, specPath = 'codex.spec.yaml', engine } = options;
  if (!payload) throw new Error('Payload is required');
  if (!payload.note_event_id) throw new Error('note_event_id is required in payload');
  const eventName = mapEventType(payload.event_type);
  if (!eventName) throw new Error('Unknown note event type');

  const supabaseConfig = resolveSupabaseConfig(env);
  if (!supabaseConfig.supabaseUrl || !supabaseConfig.serviceRoleKey) {
    throw new Error('Supabase credentials are required');
  }

  await upsertNoteWebhookRecord(payload, supabaseConfig, { status: 'pending' });

  const ruleEngine = engine ?? await loadRuleEngine(specPath);
  const userHash = payload.user_hash;
  const userState = userHash ? await fetchUserState(userHash, { env }) : { tags: [] };

  const evaluation = ruleEngine.evaluate({
    event: eventName,
    user: { tags: userState.tags },
    payload,
    meta: {}
  });

  let tagsPatched = false;
  for (const triggered of evaluation.triggered ?? []) {
    for (const operation of triggered.operations ?? []) {
      const tagOp = extractTagsOperation(operation);
      if (tagOp && userHash) {
        await applyTagChanges(userHash, tagOp, { env });
        tagsPatched = true;
      } else if (operation.type !== 'tag') {
        logUnsupported(operation);
      }
    }
  }

  await updateWebhookStatus(payload.note_event_id, supabaseConfig, {
    status: 'processed',
    processed_at: new Date().toISOString(),
    last_error: null,
    metadata: { tagsPatched }
  });

  return {
    event: eventName,
    triggered: evaluation.triggered?.length ?? 0,
    violations: evaluation.violations ?? []
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  const payload = loadPayload(args.eventPath);
  try {
    await processNoteEvent({
      payload,
      env: process.env,
      specPath: args.specPath ?? 'codex.spec.yaml'
    });
    console.log('✓ Note event processed');
  } catch (error) {
    await (async () => {
      try {
        const supabaseConfig = resolveSupabaseConfig(process.env);
        if (payload?.note_event_id && supabaseConfig?.supabaseUrl) {
          await updateWebhookStatus(payload.note_event_id, supabaseConfig, {
            status: 'error',
            last_error: error.message,
            processed_at: new Date().toISOString()
          });
        }
      } catch (updateError) {
        console.warn(`⚠️ Failed to update note_webhooks status: ${updateError.message}`);
      }
    })();
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
