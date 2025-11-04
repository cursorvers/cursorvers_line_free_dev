#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { resolveSupabaseConfig } from './upsert-progress-event.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) {
      args._ = args._ || [];
      args._.push(key);
      continue;
    }
    const option = key.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[option] = next;
      i += 1;
    } else {
      args[option] = true;
    }
  }
  return args;
}

export function buildBudgetSnapshot(costsJson, options) {
  const thresholdState = options.thresholdState ?? 'normal';
  const periodStart = costsJson?.period?.start;
  const periodEnd = costsJson?.period?.end;
  const vendorCosts = {
    anthropic: costsJson?.costs?.anthropic?.usd ?? 0,
    firebase: costsJson?.costs?.firebase?.usd ?? 0,
    github: costsJson?.costs?.github?.usd ?? 0,
  };

  const record = {
    period_start: periodStart,
    period_end: periodEnd,
    vendor_costs: vendorCosts,
    threshold_state: thresholdState,
    total_cost: costsJson?.costs?.total_usd ?? 0,
    notes: options.notes ?? null,
  };
  return record;
}

export async function upsertBudgetSnapshot(record, config) {
  const { supabaseUrl, serviceRoleKey } = config;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase credentials are required');
  }
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/budget_snapshots`;
  const response = await fetch(`${endpoint}?on_conflict=period_start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase budget_snapshot upsert failed (${response.status}): ${body}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [costJsonPath] = args._ ?? [];
  if (!costJsonPath) {
    console.error('Usage: upsert-budget-snapshot.js <cost-json> --state <STATE> [--notes <TEXT>]');
    process.exit(1);
  }

  const content = await readFile(costJsonPath, 'utf8');
  const parsed = JSON.parse(content);
  const record = buildBudgetSnapshot(parsed, {
    thresholdState: args.state ?? 'normal',
    notes: args.notes ?? null,
  });

  const config = resolveSupabaseConfig(process.env);
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    console.log(
      JSON.stringify({
        status: 'skipped',
        reason: 'missing_supabase_credentials',
      }),
    );
    return;
  }

  await upsertBudgetSnapshot(record, config);
  console.log(JSON.stringify({ status: 'ok', period_start: record.period_start }));
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ status: 'error', message: error.message }));
    process.exit(1);
  });
}
