#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const DEFAULT_MANIFEST_PATH = path.join(repoRoot, 'config', 'workflows', 'required-secrets.json');

function isTruthy(value) {
  if (value === undefined || value === null) return false;
  return String(value).trim().length > 0;
}

export async function validateWorkflowConfig({
  workflow,
  manifestPath = DEFAULT_MANIFEST_PATH,
  env = process.env,
} = {}) {
  if (!workflow) {
    throw new Error('validate-config: workflow filename argument is required');
  }

  const skipFlag = (env.SKIP_CONFIG_VALIDATION || '').toLowerCase();
  if (skipFlag === 'true' || skipFlag === '1') {
    return { ok: true, skipped: true, workflow, missing: [], missingAlternatives: [] };
  }

  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const rules = manifest[workflow];

  if (!rules) {
    return { ok: true, skipped: false, workflow, missing: [], missingAlternatives: [], rules };
  }

  const missing = [];
  for (const key of rules.required ?? []) {
    if (!isTruthy(env[key])) {
      missing.push(key);
    }
  }

  const missingAlternatives = [];
  for (const group of rules.alternatives ?? []) {
    const satisfied = group.some((key) => isTruthy(env[key]));
    if (!satisfied) {
      missingAlternatives.push(group);
    }
  }

  const ok = missing.length === 0 && missingAlternatives.length === 0;
  return { ok, skipped: false, workflow, missing, missingAlternatives, rules };
}

async function main() {
  try {
    const workflow = process.argv[2];
    if (!workflow) {
      throw new Error('validate-config: workflow filename argument is required');
    }
    const result = await validateWorkflowConfig({ workflow });
    if (result.skipped) {
      console.log(`⚠️ Validation skipped for ${workflow} (SKIP_CONFIG_VALIDATION=true)`);
      return;
    }
    if (!result.rules) {
      console.log(`ℹ️ No validation rules defined for ${workflow}; continuing.`);
      return;
    }
    if (result.ok) {
      console.log(`✅ Configuration validated for ${workflow}`);
      return;
    }

    console.error(`❌ Missing configuration for ${workflow}`);
    for (const key of result.missing) {
      console.error(`- ${key} is not set`);
    }
    for (const group of result.missingAlternatives) {
      console.error(`- One of [${group.join(', ')}] must be set`);
    }
    console.error('Set the required secrets/vars or define SKIP_CONFIG_VALIDATION=true to bypass temporarily.');
    process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
