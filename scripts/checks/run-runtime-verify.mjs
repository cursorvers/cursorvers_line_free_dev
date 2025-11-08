#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { verifyRuntimeConfig } from './verify-runtime-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const DEFAULT_SAMPLE_PATH = path.join(repoRoot, 'config', 'workflows', 'runtime-parameters.sample-values.json');

async function loadOverrides(valuesPath) {
  if (!valuesPath) return undefined;
  const raw = await readFile(valuesPath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  try {
    const mode = process.env.RUNTIME_CONFIG_VALUES;
    let overrides;
    if (mode === 'env') {
      overrides = undefined;
      console.log('Runtime verify: reading values from environment');
    } else {
      const resolvedPath = mode && mode.length > 0 && mode !== 'sample'
        ? path.resolve(repoRoot, mode)
        : DEFAULT_SAMPLE_PATH;
      console.log(`Runtime verify: using sample values from ${resolvedPath}`);
      overrides = await loadOverrides(resolvedPath);
    }

    const result = await verifyRuntimeConfig({ values: overrides });
    if (result.missingRequired.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
