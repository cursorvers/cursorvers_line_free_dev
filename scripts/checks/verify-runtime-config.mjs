#!/usr/bin/env node
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const DEFAULT_REGISTRY_PATH = path.join(repoRoot, 'config', 'workflows', 'runtime-parameters.json');

function parseArgs(argv = []) {
  const options = {
    registryPath: DEFAULT_REGISTRY_PATH,
    valuesPath: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--registry' || arg === '--registry-path') {
      options.registryPath = argv[i + 1];
      i += 1;
    } else if (arg === '--values' || arg === '--values-path') {
      options.valuesPath = argv[i + 1];
      i += 1;
    }
  }
  return options;
}

export async function loadRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  const raw = await readFile(registryPath, 'utf8');
  const data = JSON.parse(raw);
  const items = Array.isArray(data.parameters) ? data.parameters : [];
  return items.map((entry) => ({
    id: entry.id,
    type: entry.type ?? 'string',
    required: Boolean(entry.required),
    default: entry.default ?? null,
    location: entry.location ?? 'variable',
    owner: entry.owner ?? 'ops',
    description: entry.description ?? '',
  }));
}

async function readValuesFromFile(valuesPath) {
  if (!valuesPath) return null;
  try {
    const raw = await readFile(valuesPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to read values file ${valuesPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isPresent(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return true;
  return String(value).trim().length > 0;
}

export function evaluateParameters(parameters, values = {}) {
  const missingRequired = [];
  const missingOptional = [];
  const results = [];

  for (const parameter of parameters) {
    const value = Object.prototype.hasOwnProperty.call(values, parameter.id)
      ? values[parameter.id]
      : process.env[parameter.id];
    const present = isPresent(value);

    if (!present) {
      if (parameter.required) {
        missingRequired.push(parameter);
      } else {
        missingOptional.push(parameter);
      }
    }

    results.push({
      parameter,
      present,
    });
  }

  return { results, missingRequired, missingOptional };
}

function formatStatus(present, required) {
  if (present) return '✅';
  return required ? '❌' : '⚠️';
}

function maybeMask(parameter, present) {
  if (!present) return 'missing';
  if (parameter.location === 'secret') return '***';
  return 'set';
}

async function writeSummary(results) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    '### Runtime Parameter Check',
    '',
    '| Parameter | Location | Required | Status |',
    '| --- | --- | --- | --- |',
  ];
  for (const { parameter, present } of results) {
    const status = formatStatus(present, parameter.required);
    const requiredLabel = parameter.required ? 'yes' : 'no';
    lines.push(`| ${parameter.id} | ${parameter.location} | ${requiredLabel} | ${status} |`);
  }
  lines.push('');
  await appendFile(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

function logResults(results) {
  for (const { parameter, present } of results) {
    const status = formatStatus(present, parameter.required);
    const detail = parameter.description ? ` – ${parameter.description}` : '';
    console.log(`${status} ${parameter.id} (${parameter.location}) ${maybeMask(parameter, present)}${detail}`);
  }
}

export async function verifyRuntimeConfig({ registryPath = DEFAULT_REGISTRY_PATH, values } = {}) {
  const parameters = await loadRegistry(registryPath);
  const overrides = values ?? {};
  const evaluation = evaluateParameters(parameters, overrides);
  logResults(evaluation.results);
  await writeSummary(evaluation.results);
  const missing = evaluation.missingRequired;
  return {
    ...evaluation,
    missing,
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const valuesOverride = options.valuesPath ? await readValuesFromFile(options.valuesPath) : {};
    const result = await verifyRuntimeConfig({
      registryPath: options.registryPath,
      values: valuesOverride,
    });
    if (result.missingRequired.length > 0) {
      console.error('❌ Missing required runtime parameters:');
      for (const entry of result.missingRequired) {
        console.error(`- ${entry.id}`);
      }
      process.exitCode = 1;
    } else if (result.missingOptional.length > 0) {
      console.warn('⚠️ Optional runtime parameters missing:');
      for (const entry of result.missingOptional) {
        console.warn(`- ${entry.id}`);
      }
    } else {
      console.log('✅ All runtime parameters present.');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (executedPath && executedPath === __filename) {
  main();
}

