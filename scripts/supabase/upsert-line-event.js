#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export * from '../vendor/supabase/upsert-line-event.js';

async function runCli() {
  const module = await import('../vendor/supabase/upsert-line-event.js');
  const { main } = module;
  if (typeof main === 'function') {
    await main();
  }
}

const executedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (executedPath && executedPath === import.meta.url) {
  runCli().catch((error) => {
    console.error(
      JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  });
}
