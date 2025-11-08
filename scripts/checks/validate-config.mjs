#!/usr/bin/env node
import { appendFile, readFile } from 'node:fs/promises';
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

function normalizeRequirement(entry) {
  if (typeof entry === 'string') {
    return { key: entry, description: null, location: null, parameter: null };
  }
  if (entry && typeof entry === 'object') {
    const key = entry.key ?? entry.name ?? null;
    return {
      key,
      description: entry.description ?? null,
      location: entry.location ?? null,
      parameter: entry.parameter ?? entry.param ?? null,
      required: entry.required ?? undefined,
    };
  }
  return { key: null, description: null, location: null, parameter: null };
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
    return { ok: true, skipped: false, workflow, missing: [], missingAlternatives: [], rules, entries: [] };
  }

  const missing = [];
  const missingDetails = [];
  const entries = [];
  for (const key of rules.required ?? []) {
    const requirement = normalizeRequirement(key);
    if (!requirement.key) continue;
    const present = isTruthy(env[requirement.key]);
    entries.push({
      requirement: { ...requirement, type: 'required' },
      present,
      group: null,
    });
    if (!present) {
      missing.push(requirement.key);
      missingDetails.push(requirement);
    }
  }

  const missingAlternatives = [];
  const missingAlternativeDetails = [];
  let groupCounter = 0;
  for (const group of rules.alternatives ?? []) {
    groupCounter += 1;
    const normalizedGroup = group.map(normalizeRequirement).filter((entry) => entry.key);
    const satisfied = normalizedGroup.some((entry) => isTruthy(env[entry.key]));
    const groupId = `group-${groupCounter}`;
    normalizedGroup.forEach((entry) => {
      entries.push({
        requirement: { ...entry, type: 'alternative' },
        present: isTruthy(env[entry.key]),
        group: groupId,
      });
    });
    if (!satisfied) {
      missingAlternatives.push(normalizedGroup.map((entry) => entry.key));
      missingAlternativeDetails.push(normalizedGroup);
    }
  }

  const ok = missing.length === 0 && missingAlternatives.length === 0;
  return {
    ok,
    skipped: false,
    workflow,
    missing,
    missingAlternatives,
    missingDetails,
    missingAlternativeDetails,
    rules,
    entries,
  };
}

function statusEmoji(present, type) {
  if (present) return '✅';
  if (type === 'required') return '❌';
  return '⚠️';
}

function requirementLabel(entry) {
  if (entry.type === 'required') return 'required';
  if (entry.type === 'alternative') return entry.group ? `one-of (${entry.group})` : 'one-of';
  return 'optional';
}

async function writeSummary(entries = []) {
  if (!process.env.GITHUB_STEP_SUMMARY || entries.length === 0) return;
  const lines = [
    '### Configuration Validation',
    '',
    '| Key | Location | Requirement | Status | Runtime Param | Description |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const entry of entries) {
    const { requirement, present } = entry;
    const location = requirement.location ?? 'unspecified';
    const status = statusEmoji(present, requirement.type);
    const label = requirementLabel(entry);
    const parameter = requirement.parameter ?? '—';
    const description = requirement.description ? requirement.description.replace(/\|/g, '\\|') : '—';
    lines.push(`| ${requirement.key} | ${location} | ${label} | ${status} | ${parameter} | ${description} |`);
  }
  lines.push('');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
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
      await writeSummary(result.entries);
      return;
    }
    await writeSummary(result.entries);
    if (result.ok) {
      console.log(`✅ Configuration validated for ${workflow}`);
      return;
    }

    console.error(`❌ Missing configuration for ${workflow}`);
    const missingDetails = result.missingDetails ?? [];
    const missingAltDetails = result.missingAlternativeDetails ?? [];

    if (missingDetails.length > 0) {
      for (const detail of missingDetails) {
        const note = detail.description ? ` (${detail.description})` : '';
        console.error(`- ${detail.key} is not set${note}`);
      }
    } else {
      for (const key of result.missing) {
        console.error(`- ${key} is not set`);
      }
    }

    if (missingAltDetails.length > 0) {
      for (const group of missingAltDetails) {
        const label = group
          .map((detail) => (detail.description ? `${detail.key} (${detail.description})` : detail.key))
          .join(', ');
        console.error(`- One of [${label}] must be set`);
      }
    } else {
      for (const group of result.missingAlternatives) {
        console.error(`- One of [${group.join(', ')}] must be set`);
      }
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
