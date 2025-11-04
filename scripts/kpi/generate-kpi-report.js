#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const KPI_TARGET = 0.4; // 40% target

export function getDateRange(now = new Date(), days = 7) {
  const endDate = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const startDate = start.toISOString().slice(0, 10);
  return { startDate, endDate };
}

const defaultRange = getDateRange();

export async function fetchFromSupabase(range = defaultRange) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Supabase credentials missing. Returning zero metrics.');
    return {
      total_subscribers: 0,
      paid_conversions: 0,
      conversion_rate: 0,
      status: 'missing_supabase_credentials',
    };
  }

  const rpcUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/line_conversion_kpi`;
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ start_date: range.startDate, end_date: range.endDate }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn('Supabase KPI RPC failed:', res.status, text);
    return {
      total_subscribers: 0,
      paid_conversions: 0,
      conversion_rate: 0,
      status: `supabase_error_${res.status}`,
    };
  }

  const data = await res.json();
  const row = Array.isArray(data) ? data[0] : data;
  return {
    total_subscribers: Number(row?.total_subscribers ?? 0),
    paid_conversions: Number(row?.paid_conversions ?? 0),
    conversion_rate: Number(row?.conversion_rate ?? 0),
    status: 'ok',
  };
}

export function buildSummary(
  kpi,
  range = defaultRange,
  target = KPI_TARGET,
) {
  const percent = (kpi.conversion_rate * 100).toFixed(2);
  const targetPercent = (target * 100).toFixed(0);
  const targetMet = kpi.conversion_rate >= target;
  const statusLine = targetMet ? '✅ Target met' : '⚠️ Below target';
  return `## 📊 Weekly KPI Report (${range.startDate} – ${range.endDate})\n\n` +
    `- Total new subscribers: **${kpi.total_subscribers}**\n` +
    `- Paid conversions: **${kpi.paid_conversions}**\n` +
    `- Conversion rate: **${percent}%** (target ${targetPercent}%)\n` +
    `- Status: ${statusLine}\n` +
    (kpi.status !== 'ok' ? `\n> ℹ️ Data source status: ${kpi.status}\n` : '') +
    `\nNext steps:\n` +
    (targetMet
      ? `- Keep current cadence; review segmentation opportunities.\n`
      : `- Investigate funnel drop-off and adjust messaging cadence or offers.\n`) +
    `- Ensure Google Sheets + Supabase data sync is up to date.\n`;
}

export async function main() {
  const range = getDateRange();
  const kpi = await fetchFromSupabase(range);
  const summary = buildSummary(kpi, range);

  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/kpi.json', JSON.stringify({
    start_date: range.startDate,
    end_date: range.endDate,
    target_rate: KPI_TARGET,
    ...kpi,
  }, null, 2));
  writeFileSync('tmp/kpi.md', summary);

  console.log(summary);
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] === modulePath) {
  main().catch((error) => {
    console.error('Failed to generate KPI report', error);
    process.exit(1);
  });
}
