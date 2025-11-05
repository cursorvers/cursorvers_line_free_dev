#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export * from '../vendor/google/upsert-line-member.js';

async function runCli() {
  const module = await import('../vendor/google/upsert-line-member.js');
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
    console.error('Failed to update Google Sheets:', error);
    process.exit(1);
  });
}
