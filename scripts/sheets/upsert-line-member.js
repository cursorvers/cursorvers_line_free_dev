#!/usr/bin/env node
/**
 * Stub Google Sheets upsert for line members.
 * Logs skip when service account credentials are missing.
 */
const fs = require('fs');

function main() {
  const [eventPath] = process.argv.slice(2);
  if (!eventPath || !fs.existsSync(eventPath)) {
    console.error("Event file not found; exiting");
    process.exit(0);
  }

  const creds = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!creds || !sheetId) {
    console.log("Sheets credentials missing; skipping ledger update.");
    return;
  }

  const payload = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
  const userCount = (payload.events || []).length;
  console.log(JSON.stringify({
    status: "ok",
    message: `stubbed ledger update for ${userCount} event(s)`
  }));
}

main();
