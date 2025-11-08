#!/usr/bin/env node
/**
 * Fetch line-related configuration from Manus API and expose values for GitHub Actions.
 *
 * Usage:
 *   node scripts/manus/export-config.mjs \
 *     --output tmp/manus-line-config.json \
 *     --path /v1/config/line
 *
 * The script writes JSON to the output path and, when executed inside GitHub Actions,
 * appends relevant environment variables (LINE_CASE_STUDIES_URL, LINE_GUIDE_URL, LINE_GIFT_URL)
 * to $GITHUB_ENV for downstream steps.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fetchManusConfig } from '../lib/manus-api.js';

function printUsage() {
  console.log(`Usage:
  node scripts/manus/export-config.mjs [--output <path>] [--path <config-path>]

Options:
  --output   Output JSON path (default: tmp/manus-line-config.json)
  --path     Manus API path (default: /v1/config/line)
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--output') {
      args.output = argv[++i];
    } else if (current === '--path') {
      args.path = argv[++i];
    } else if (current === '--help' || current === '-h') {
      args.help = true;
    }
  }
  return args;
}

/**
 * Extract LINE URL environment variables from Manus config
 * @param {Object} config - Manus config object
 * @returns {Object} - Map of environment variable names to values
 */
function extractEnvEntries(config) {
  const envMap = {};
  
  // Map common Manus config keys to LINE environment variables
  if (config.line_case_studies_url) {
    envMap.LINE_CASE_STUDIES_URL = config.line_case_studies_url;
  }
  if (config.line_guide_url) {
    envMap.LINE_GUIDE_URL = config.line_guide_url;
  }
  if (config.line_gift_url) {
    envMap.LINE_GIFT_URL = config.line_gift_url;
  }
  if (config.line_premium_url) {
    envMap.LINE_PREMIUM_URL = config.line_premium_url;
  }
  
  // Also check nested structure
  if (config.line && typeof config.line === 'object') {
    if (config.line.case_studies_url) {
      envMap.LINE_CASE_STUDIES_URL = config.line.case_studies_url;
    }
    if (config.line.guide_url) {
      envMap.LINE_GUIDE_URL = config.line.guide_url;
    }
    if (config.line.gift_url) {
      envMap.LINE_GIFT_URL = config.line.gift_url;
    }
    if (config.line.premium_url) {
      envMap.LINE_PREMIUM_URL = config.line.premium_url;
    }
  }
  
  return envMap;
}

/**
 * Append environment variables to GitHub Actions $GITHUB_ENV
 * @param {Object} envMap - Map of variable names to values
 */
async function appendToGithubEnv(envMap) {
  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) {
    console.log('ℹ️ Not running in GitHub Actions. Skipping $GITHUB_ENV update.');
    return;
  }
  
  const lines = Object.entries(envMap).map(([key, value]) => {
    // Escape newlines and special characters for GitHub Actions
    const escaped = String(value).replace(/\n/g, '%0A').replace(/\r/g, '%0D');
    return `${key}=${escaped}`;
  });
  
  await fs.appendFile(githubEnv, `${lines.join('\n')}\n`);
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printUsage();
      return;
    }

    const outputPath = path.resolve(args.output ?? 'tmp/manus-line-config.json');
    const apiPath = args.path ?? process.env.MANUS_LINE_CONFIG_PATH ?? '/v1/config/line';

    const config = await fetchManusConfig({ path: apiPath });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✓ Manus config written to ${outputPath}`);

    const envEntries = extractEnvEntries(config);
    if (Object.keys(envEntries).length > 0) {
      console.log('✓ Extracted LINE URL overrides:');
      for (const [key, value] of Object.entries(envEntries)) {
        console.log(`  - ${key}: ${value}`);
      }
      await appendToGithubEnv(envEntries);
    } else {
      console.log('ℹ️ No LINE URL overrides found in config. Using defaults.');
    }
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

