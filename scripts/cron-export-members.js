/**
 * Export members (email list) from Supabase to Google Sheets.
 * - Source of truth: Supabase `members`
 * - Split into two tabs:
 *   - `members_paid`: tier in ('library','master') AND status='active'
 *   - `members_free`: tier='free' AND status='active'
 * - Newsletter: メールアドレス登録者は全員対象（opt_in_email に依存しない）
 *
 * Requirements:
 * - Environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_SHEET_ID (target spreadsheet)
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (with \n newlines)
 *
 * Run (node >=18):
 *   node scripts/cron-export-members.js
 */

import { google } from "npm:googleapis@126.0.1";
import fetch from "npm:node-fetch@3.3.2";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GOOGLE_SHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
} = Deno.env.toObject();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}
if (
  !GOOGLE_SHEET_ID ||
  !GOOGLE_SERVICE_ACCOUNT_EMAIL ||
  !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
) {
  console.error("Missing Google Sheets credentials");
  Deno.exit(1);
}

const sheetPaid = "members_paid";
const sheetFree = "members_free";
const columns = [
  "email",
  "tier",
  "status",
  "period_end",
  "opt_in_email",
  "updated_at",
  "line_user_id",
];

async function fetchMembers(filter) {
  const query = `members?${filter}&select=${columns.join(",")}`;
  const url = `${SUPABASE_URL}/rest/v1/${query}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase fetch failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data;
}

async function getSheetsClient() {
  const auth = new google.auth.JWT(
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  const sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

const toRows = (data) =>
  data.map((row) => [
    row.email ?? "",
    row.tier ?? "",
    row.status ?? "",
    row.period_end ?? "",
    row.opt_in_email ?? "",
    row.updated_at ?? "",
    row.line_user_id ?? "",
  ]);

async function clearAndWrite(sheets, targetSheet, rows) {
  // Clear sheet
  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: targetSheet,
  });

  // Write header + rows
  const values = [
    [
      "Email",
      "Tier",
      "Status",
      "Period End",
      "Opt In Email",
      "Updated At",
      "Line User ID",
    ],
    ...rows,
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: targetSheet,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

async function main() {
  try {
    console.log("[members-export] fetching paid members...");
    const [paid, free] = await Promise.all([
      fetchMembers("status=eq.active&tier=in.(library,master)"),
      fetchMembers("status=eq.active&tier=eq.free"),
    ]);
    console.log(`[members-export] paid: ${paid.length}, free: ${free.length}`);

    const sheets = await getSheetsClient();
    await clearAndWrite(sheets, sheetPaid, toRows(paid));
    await clearAndWrite(sheets, sheetFree, toRows(free));
    console.log(
      "[members-export] written to sheets:",
      `${sheetPaid} (${paid.length})`,
      `${sheetFree} (${free.length})`
    );
  } catch (err) {
    console.error("[members-export] failed:", err);
    Deno.exit(1);
  }
}

await main();


