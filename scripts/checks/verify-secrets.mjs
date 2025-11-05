#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const CONFIG_PATH = resolve('config/workflows/required-secrets.json');

function loadConfig() {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to load ${CONFIG_PATH}: ${error.message ?? error}`);
  }
}

function pickWorkflows(config, names) {
  if (!names || names.length === 0) {
    return Object.entries(config);
  }
  const set = new Set(names);
  return Object.entries(config).filter(([workflow]) => set.has(workflow));
}

function evaluateWorkflow(workflowName, spec, env) {
  const missingRequired = [];
  const alternativeFailures = [];

  for (const name of spec.required ?? []) {
    if (!env[name] || String(env[name]).trim() === '') {
      missingRequired.push(name);
    }
  }

  for (const group of spec.alternatives ?? []) {
    const satisfied = group.some((name) => env[name] && String(env[name]).trim() !== '');
    if (!satisfied) {
      alternativeFailures.push(group);
    }
  }

  return {
    workflow: workflowName,
    missingRequired,
    alternativeFailures,
  };
}

function formatResult(result) {
  const lines = [`Workflow: ${result.workflow}`];
  if (result.missingRequired.length === 0 && result.alternativeFailures.length === 0) {
    lines.push('  ✅ all secrets/variables present');
  } else {
    if (result.missingRequired.length > 0) {
      lines.push(`  ❌ missing required: ${result.missingRequired.join(', ')}`);
    }
    for (const group of result.alternativeFailures) {
      lines.push(`  ❌ one of ${group.join(' / ')} must be set`);
    }
  }
  return lines.join('\n');
}

function main(argv = process.argv.slice(2), env = process.env) {
  const config = loadConfig();
  const workflows = [];
  const args = [];
  for (const arg of argv) {
    if (arg === '--all') {
      workflows.splice(0, workflows.length, ...Object.keys(config));
      continue;
    }
    if (arg.startsWith('--workflow=')) {
      workflows.push(arg.split('=')[1]);
      continue;
    }
    args.push(arg);
  }

  if (workflows.length === 0 && args.length > 0) {
    workflows.push(...args);
  }

  const picked = pickWorkflows(config, workflows);
  if (picked.length === 0) {
    console.log('No workflows to evaluate.');
    return 0;
  }

  let failures = 0;
  for (const [workflowName, spec] of picked) {
    const result = evaluateWorkflow(workflowName, spec, env);
    console.log(formatResult(result));
    if (result.missingRequired.length > 0 || result.alternativeFailures.length > 0) {
      failures += result.missingRequired.length + result.alternativeFailures.length;
    }
  }

  return failures === 0 ? 0 : 2;
}

async function runCli() {
  const exitCode = await main();
  process.exit(exitCode);
}

const executedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (executedPath && executedPath === import.meta.url) {
  await runCli();
}

export { evaluateWorkflow, main };
