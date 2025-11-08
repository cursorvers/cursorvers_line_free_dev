#!/usr/bin/env node
/**
 * Compile scenario definitions into deployable LINE template JSON files.
 *
 * By default converts docs/design/line-richmenu/scenarios/*.json into
 * config/line/templates/<name>.json with resolved quick replies and flex bodies.
 *
 * Usage:
 *   node scripts/automation/build-line-templates.mjs \
 *     --src docs/design/line-richmenu/scenarios \
 *     --dest config/line/templates
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function printUsage() {
  console.log(`Usage:
  node scripts/automation/build-line-templates.mjs [--src <dir>] [--dest <dir>]

Options:
  --src   Scenario directory (default: docs/design/line-richmenu/scenarios)
  --dest  Output directory (default: config/line/templates)
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--src') {
      args.src = argv[++i];
    } else if (token === '--dest') {
      args.dest = argv[++i];
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }
  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveMessage(descriptor, baseDir) {
  if (descriptor.flex) {
    const flexPath = path.resolve(baseDir, descriptor.flex);
    if (!fs.existsSync(flexPath)) {
      throw new Error(`Flex file not found: ${flexPath}`);
    }
    const flexMessage = loadJson(flexPath);
    if (!flexMessage || flexMessage.type !== 'flex') {
      throw new Error(`Flex file must contain a flex message object: ${flexPath}`);
    }
    return flexMessage;
  }

  if (!descriptor.type) {
    throw new Error('Scenario message must specify "type" or "flex"');
  }

  const message = structuredClone(descriptor);
  if (typeof descriptor.quickReply === 'string') {
    const qrPath = path.resolve(baseDir, descriptor.quickReply);
    if (!fs.existsSync(qrPath)) {
      throw new Error(`Quick reply file not found: ${qrPath}`);
    }
    const quickReplyItems = loadJson(qrPath);
    message.quickReply = { items: quickReplyItems };
  }
  delete message.flex;
  return message;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const srcDir = path.resolve(args.src ?? 'docs/design/line-richmenu/scenarios');
  const destDir = path.resolve(args.dest ?? 'config/line/templates');

  if (!fs.existsSync(srcDir)) {
    throw new Error(`Scenario directory not found: ${srcDir}`);
  }
  ensureDir(destDir);

  const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.json'));
  if (files.length === 0) {
    console.log(`No scenario JSON files found in ${srcDir}`);
    return;
  }

  for (const file of files) {
    const inputPath = path.join(srcDir, file);
    const scenario = loadJson(inputPath);
    if (!Array.isArray(scenario.messages)) {
      throw new Error(`Scenario ${file} is missing "messages" array`);
    }

    const baseDir = path.dirname(inputPath);
    const messages = scenario.messages.map((descriptor) => resolveMessage(descriptor, baseDir));
    const output = {
      description: scenario.description ?? '',
      messages
    };

    const outputPath = path.join(destDir, file);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`✓ Built ${outputPath}`);
  }

  console.log('\nDone.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
