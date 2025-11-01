#!/usr/bin/env node
/**
 * Manus API CLI
 * Manus APIを呼び出すためのCLIツール
 */

import { readFileSync } from 'fs';
import { createManusTask, getManusTask } from './lib/manus-api.js';

const [,, command, ...rawArgs] = process.argv;

function parseOptions(args) {
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    switch (token) {
      case '--idempotency': {
        const value = args[++i];
        if (!value) throw new Error('--idempotency requires a value');
        options.idempotency = value;
        break;
      }
      case '--metadata-file': {
        const file = args[++i];
        if (!file) throw new Error('--metadata-file requires a path');
        options.metadataFile = file;
        break;
      }
      case '--metadata': {
        const value = args[++i];
        if (!value) throw new Error('--metadata requires a JSON string');
        options.metadata = JSON.parse(value);
        break;
      }
      case '--dry-run': {
        options.dryRun = true;
        break;
      }
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }
  return { options, positional };
}

async function main() {
  try {
    if (command === 'create') {
      const { options, positional } = parseOptions(rawArgs);
      const [briefFile, planFile, webhookUrl] = positional;

      if (!briefFile || !planFile) {
        console.error('Usage: node scripts/manus-api.js create [--dry-run] [--idempotency <key>] [--metadata-file <path>] <brief-file> <plan-file> [webhook-url]');
        process.exit(1);
      }

      const brief = readFileSync(briefFile, 'utf-8');
      const plan = JSON.parse(readFileSync(planFile, 'utf-8'));
      let metadata = options.metadataFile
        ? JSON.parse(readFileSync(options.metadataFile, 'utf-8'))
        : (options.metadata || undefined);

      if (options.idempotency) {
        metadata = metadata && typeof metadata === 'object' ? { ...metadata } : {};
        if (!metadata.idempotency_key) {
          metadata.idempotency_key = options.idempotency;
        }
      }

      console.log('🚀 Creating Manus task...');
      const result = await createManusTask({
        brief,
        plan,
        webhookUrl,
        metadata,
        dryRun: options.dryRun
      });

      console.log('✅ Task created:', JSON.stringify(result, null, 2));
    } else if (command === 'get') {
      const taskId = process.argv[3];

      if (!taskId) {
        console.error('Usage: node scripts/manus-api.js get <task-id>');
        process.exit(1);
      }

      console.log(`📋 Fetching task ${taskId}...`);
      const result = await getManusTask(taskId);
      console.log('✅ Task info:', JSON.stringify(result, null, 2));
    } else {
      console.error('Usage: node scripts/manus-api.js <create|get> [args...]');
      console.error('  create <brief-file> <plan-file> [webhook-url]');
      console.error('  get <task-id>');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
