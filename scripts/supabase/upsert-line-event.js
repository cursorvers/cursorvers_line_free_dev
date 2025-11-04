#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveSupabaseConfig } from './upsert-progress-event.js';

const DEDUPE_PREFIX = 'line';

export function extractPlanMetadata(plan = {}) {
  if (!plan || typeof plan !== 'object') {
    return {
      planId: 'line_plan',
      planVersion: 'v0',
    };
  }

  const planId =
    plan.id ||
    plan.plan_id ||
    (typeof plan.title === 'string'
      ? plan.title.toLowerCase().replace(/\s+/g, '-').slice(0, 64)
      : 'line_plan');

  const planVersion =
    plan.version ||
    plan.plan_version ||
    plan.metadata?.version ||
    'v0';

  return {
    planId,
    planVersion,
  };
}

export function buildProgressRecords(eventPayload, options = {}) {
  const {
    planId = 'line_plan',
    planVersion = 'v0',
    correlationId,
    planVariant = 'production',
  } = options;
  if (!eventPayload || !Array.isArray(eventPayload.events)) {
    return [];
  }

  return eventPayload.events
    .map((event, index) => {
      const userHash = event?.source?.userId || '';
      if (!userHash) return null;

      const eventType = event?.type || 'unknown';
      const timestamp = event?.timestamp
        ? new Date(Number(event.timestamp)).toISOString()
        : new Date().toISOString();

      const dedupeKey = options.dedupeKey
        ? `${options.dedupeKey}:${index}`
        : createLineDedupeKey({
            userHash,
            eventType,
            timestamp,
            messageId: event?.message?.id,
            replyToken: event?.replyToken,
          });

      return {
        source: 'line',
        user_hash: userHash,
        plan_id: planId,
        plan_version: planVersion,
        plan_variant: planVariant,
        event_type: eventType,
        payload: event,
        decision: 'proceed',
        cost_estimate: null,
        manus_points_consumed: null,
        retry_after_seconds: null,
        dedupe_key: dedupeKey,
        manus_run_id: null,
        status: 'complete',
        evidence: {
          channel: 'line',
          message_type: event?.message?.type ?? null,
        },
        correlation_id: correlationId ?? null,
        recorded_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      };
    })
    .filter(Boolean);
}

function normalizeTags(event) {
  if (Array.isArray(event?.tags)) {
    return event.tags.map(String);
  }
  if (event?.link?.result) {
    return [String(event.link.result)];
  }
  if (event?.source?.groupId) {
    return [String(event.source.groupId)];
  }
  return [];
}

function deriveStatus(eventType) {
  if (!eventType) return 'lead';
  switch (eventType) {
    case 'follow':
      return 'active';
    case 'message':
      return 'engaged';
    case 'unfollow':
      return 'churned';
    default:
      return 'lead';
  }
}

export function buildLineMemberRecord(event) {
  const userHash = event?.source?.userId;
  if (!userHash) return null;

  const timestamp = event?.timestamp
    ? new Date(Number(event.timestamp)).toISOString()
    : new Date().toISOString();

  const metadata = {
    latest_stage: event?.type || 'unknown',
    last_event_type: event?.type || 'unknown',
    last_message: event?.message?.text ?? null,
    reply_token: event?.replyToken ?? null,
  };

  return {
    user_hash: userHash,
    first_opt_in_at: timestamp,
    last_opt_in_at: timestamp,
    cta_tags: normalizeTags(event),
    status: deriveStatus(event?.type),
    guardrail_sent_at: event?.guardrail?.sentAt ?? timestamp,
    consent_guardrail: event?.guardrail?.sent ?? true,
    metadata,
    updated_at: timestamp,
  };
}

function downgradeLineMemberRecord(record) {
  const {
    first_opt_in_at,
    last_opt_in_at,
    guardrail_sent_at,
    consent_guardrail,
    status,
    cta_tags,
    metadata = {},
    ...rest
  } = record;

  const downgradedMetadata = { ...metadata };
  const fallback = {
    first_opt_in_at,
    last_opt_in_at,
    guardrail_sent_at,
    consent_guardrail,
    status,
    cta_tags,
  };

  const entries = Object.entries(fallback).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length > 0) {
    downgradedMetadata.supabase_missing_columns = {
      ...(metadata.supabase_missing_columns || {}),
      ...Object.fromEntries(entries),
    };
  }

  return {
    ...rest,
    metadata: downgradedMetadata,
  };
}

export function createLineDedupeKey({
  userHash,
  eventType,
  timestamp,
  messageId,
  replyToken,
}) {
  const hash = createHash('sha256');
  hash.update(DEDUPE_PREFIX);
  hash.update('|');
  hash.update(userHash ?? '');
  hash.update('|');
  hash.update(eventType ?? '');
  hash.update('|');
  hash.update(timestamp ?? '');
  hash.update('|');
  hash.update(messageId ?? '');
  hash.update('|');
  hash.update(replyToken ?? '');
  return hash.digest('hex');
}

export async function upsertSupabaseRecords({
  supabaseUrl,
  serviceRoleKey,
  progressRecords,
  memberRecords,
}) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase credentials are required');
  }

  const base = supabaseUrl.replace(/\/$/, '');
  const headers = {
    'Content-Type': 'application/json',
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };

  if (progressRecords.length > 0) {
    const resp = await fetch(
      `${base}/rest/v1/progress_events?on_conflict=dedupe_key`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(progressRecords),
      },
    );
    if (!resp.ok) {
      const message = await resp.text();
      throw new Error(
        `Supabase progress_events upsert failed (${resp.status}): ${message}`,
      );
    }
  }

  if (memberRecords.length > 0) {
    const requestBody = JSON.stringify(memberRecords);
    const endpoint = `${base}/rest/v1/line_members?on_conflict=user_hash`;

    const attempt = async (body, attemptLabel = 'primary') => {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
      });
      const text = resp.ok ? '' : await resp.text();
      return { resp, text, attemptLabel };
    };

    let { resp, text } = await attempt(requestBody);

    if (!resp.ok && resp.status === 400 && text.includes("'first_opt_in_at'")) {
      const downgradedRecords = memberRecords.map((record) =>
        downgradeLineMemberRecord(record),
      );
      console.warn(
        'Supabase line_members schema is missing columns (first_opt_in_at, etc). Retrying with downgraded payload.',
      );
      console.warn(
        JSON.stringify({
          downgraded_member_records: downgradedRecords,
        }),
      );
      const downgradedBody = JSON.stringify(downgradedRecords);
      ({ resp, text } = await attempt(downgradedBody, 'downgraded'));
    }

    if (!resp.ok) {
      throw new Error(
        `Supabase line_members upsert failed (${resp.status}): ${text}`,
      );
    }
  }
}

async function main() {
  const [, eventPath, planPath] = process.argv.slice(1);
  if (!eventPath) {
    console.error(
      'Usage: upsert-line-event.js <line-event-json> [plan-json] [correlation-id]',
    );
    process.exit(1);
  }

  const planJson = planPath
    ? JSON.parse(await readFile(planPath, 'utf8'))
    : {};
  const eventPayload = JSON.parse(await readFile(eventPath, 'utf8'));

  const { planId, planVersion } = extractPlanMetadata(planJson);

  const correlationId = process.argv[4] || null;
  const progressRecords = buildProgressRecords(eventPayload, {
    planId,
    planVersion,
    correlationId,
    planVariant: process.env.PLAN_MODE === 'degraded' ? 'degraded' : 'production',
  });
  const memberRecords = eventPayload.events
    ? eventPayload.events
        .map((event) => buildLineMemberRecord(event))
        .filter(Boolean)
    : [];

  if (progressRecords.length === 0 && memberRecords.length === 0) {
    console.log(
      JSON.stringify({
        status: 'skipped',
        reason: 'no_events',
      }),
    );
    return;
  }

  const { supabaseUrl, serviceRoleKey } = resolveSupabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    console.log(
      JSON.stringify({
        status: 'skipped',
        reason: 'missing_supabase_credentials',
        progress_records: progressRecords.length,
        member_records: memberRecords.length,
      }),
    );
    return;
  }

  await upsertSupabaseRecords({
    supabaseUrl,
    serviceRoleKey,
    progressRecords,
    memberRecords,
  });

  console.log(
    JSON.stringify({
      status: 'ok',
      progress_records: progressRecords.length,
      member_records: memberRecords.length,
    }),
  );
}

const executedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).pathname
  : null;

if (executedPath && executedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  });
}
