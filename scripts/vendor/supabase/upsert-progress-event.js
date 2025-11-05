#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import process from 'node:process';

const ALLOWED_DECISIONS = new Set([
  'proceed',
  'retry',
  'amended',
  'abort',
]);

const STATUS_MAP = new Map([
  ['step_started', 'running'],
  ['step_running', 'running'],
  ['step_completed', 'complete'],
  ['task_completed', 'complete'],
  ['step_failed', 'failed'],
  ['task_failed', 'failed'],
  ['task_enqueued', 'queued'],
  ['queued', 'queued'],
  ['failed', 'failed'],
  ['complete', 'complete'],
  ['completed', 'complete'],
  ['running', 'running'],
  ['default', 'running'],
]);

export function buildProgressRecord(event, options = {}) {
  const normalizedDecision = normalizeDecision(
    options.decisionOverride ?? event?.plan_delta?.decision,
  );

  const status =
    normalizeStatus(
      options.statusOverride ?? event?.status ?? event?.event_type,
    );

  const dedupeKey = resolveDedupeKey(event, options.dedupeKey);
  const recordedAt = resolveRecordedAt(event);

  return {
    source: 'manus',
    user_hash: resolveUserHash(event),
    plan_id: resolvePlanId(event),
    plan_version: resolvePlanVersion(event),
    plan_variant: resolvePlanVariant(event),
    event_type: event?.event_type ?? 'unknown',
    payload: event,
    decision: normalizedDecision,
    cost_estimate: resolveCostEstimate(event),
    manus_points_consumed: resolveManusPoints(event),
    retry_after_seconds: resolveRetryAfter(event),
    dedupe_key: dedupeKey,
    manus_run_id: event?.manus_run_id ?? null,
    status,
    evidence: event?.plan_delta?.evidence ?? null,
    correlation_id: options.correlationId ?? event?.correlation_id ?? null,
    recorded_at: recordedAt,
    updated_at: recordedAt,
  };
}

function resolveUserHash(event) {
  if (event?.context?.user_hash) return event.context.user_hash;
  if (event?.user_hash) return event.user_hash;
  const taskId = event?.task_id ?? 'unknown-task';
  return `manus::${taskId}`;
}

function resolvePlanId(event) {
  return (
    event?.plan_id ??
    event?.context?.plan_id ??
    event?.plan_title ??
    'unknown-plan'
  );
}

function resolvePlanVersion(event) {
  return (
    event?.plan_version ?? event?.context?.plan_version ?? 'v0'
  );
}

function resolvePlanVariant(event) {
  return (
    event?.plan_variant ??
    event?.context?.plan_variant ??
    'production'
  );
}

function resolveCostEstimate(event) {
  const value = event?.plan_delta?.cost_estimate ?? event?.cost_estimate;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }
  return null;
}

function resolveManusPoints(event) {
  const points = event?.manus_points_consumed ?? event?.metrics?.manus_points;
  if (typeof points === 'number' && Number.isFinite(points)) {
    return Number(points.toFixed(2));
  }
  return null;
}

function resolveRetryAfter(event) {
  const value = event?.retry_after_seconds ?? event?.plan_delta?.retry_after_seconds;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  return null;
}

function resolveRecordedAt(event) {
  if (event?.ts) return event.ts;
  if (event?.created_at) return event.created_at;
  return new Date().toISOString();
}

function normalizeDecision(decision) {
  const lower = typeof decision === 'string'
    ? decision.toLowerCase()
    : '';
  if (ALLOWED_DECISIONS.has(lower)) {
    return lower;
  }
  return 'proceed';
}

function normalizeStatus(status) {
  const key = typeof status === 'string'
    ? status.toLowerCase()
    : 'default';
  return STATUS_MAP.get(key) ?? STATUS_MAP.get('default');
}

function resolveDedupeKey(event, provided) {
  if (provided) return provided;
  if (event?.dedupe_key) return event.dedupe_key;
  if (event?.idempotency_key) return event.idempotency_key;
  const hash = createHash('sha256');
  hash.update(event?.task_id ?? 'unknown');
  hash.update('|');
  hash.update(event?.step_id ?? 'none');
  hash.update('|');
  hash.update(event?.event_type ?? 'unknown');
  hash.update('|');
  hash.update(event?.ts ?? new Date().toISOString());
  return hash.digest('hex');
}

export function resolveSupabaseConfig(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL || '';
  const serviceRoleKey =
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ACCESS_TOKEN ||
    env.SUPABASE_KEY || env.SUPABASE_ANON_KEY || '';

  return {
    supabaseUrl: supabaseUrl.trim(),
    serviceRoleKey: serviceRoleKey.trim(),
  };
}

export async function upsertProgressEvent(record, config) {
  const { supabaseUrl, serviceRoleKey } = config;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase credentials are required for upserting');
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/progress_events?on_conflict=dedupe_key`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Supabase upsert failed (${response.status}): ${errorText}`,
    );
  }

  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
}

async function main() {
  const [, fileArg] = process.argv.slice(1);
  if (!fileArg) {
    console.error('Usage: upsert-progress-event.js <event-json-file>');
    process.exit(1);
  }

  const raw = await readFile(fileArg, 'utf8');
  const event = JSON.parse(raw);

  const { supabaseUrl, serviceRoleKey } = resolveSupabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    console.log(
      JSON.stringify({
        status: 'skipped',
        reason: 'missing_supabase_credentials',
      }),
    );
    return;
  }

  const record = buildProgressRecord(event, {
    dedupeKey: event?.dedupe_key,
    correlationId: event?.correlation_id,
    decisionOverride: event?.plan_delta?.decision,
    statusOverride: event?.status,
  });

  try {
    const inserted = await upsertProgressEvent(record, {
      supabaseUrl,
      serviceRoleKey,
    });
    console.log(
      JSON.stringify({
        status: 'ok',
        dedupe_key: record.dedupe_key,
        supabase_id: inserted?.id ?? null,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  }
}

export { main };
