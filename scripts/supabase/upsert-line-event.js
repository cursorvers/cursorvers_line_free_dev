#!/usr/bin/env node
/**
 * Stub Supabase upsert for line events.
 * Validates input files and emits a JSON status payload.
 */
const fs = require('fs');

function main() {
  const [eventPath, planPath, runRef] = process.argv.slice(2);
  if (!eventPath || !planPath) {
    console.error(JSON.stringify({ status: "error", message: "eventPath and planPath required" }));
    process.exit(1);
  }

  const exists = (p) => fs.existsSync(p);
  if (!exists(eventPath) || !exists(planPath)) {
    console.error(JSON.stringify({ status: "error", message: "input file missing" }));
    process.exit(1);
  }

  const output = {
    status: "ok",
    run_ref: runRef || "",
    note: "stub supabase upsert; replace with real implementation"
  };
  console.log(JSON.stringify(output));
}

main();
