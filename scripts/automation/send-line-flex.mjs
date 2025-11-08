#!/usr/bin/env node
/**
 * Send a Flex message to LINE users via the Messaging API.
 *
 * Usage (push to specific user):
 *   node scripts/automation/send-line-flex.mjs \
 *     --to Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
 *     --file docs/design/line-richmenu/flex-welcome.json \
 *     --token "$LINE_CHANNEL_ACCESS_TOKEN"
 *
 * Usage (broadcast to all):
 *   node scripts/automation/send-line-flex.mjs \
 *     --broadcast \
 *     --file docs/design/line-richmenu/flex-welcome.json
 *
 * The JSON file should contain a single Flex message object
 * (type/altText/contents). The script wraps it into the proper request body.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyTemplatePlaceholders } from '../lib/line.js';

const API_BASE = 'https://api.line.me/v2/bot';

function printUsage() {
  console.log(`Usage:
  node scripts/automation/send-line-flex.mjs --file <flex.json> [--to <userId> | --broadcast] [--token <channel_access_token>]

Options:
  --file        Path to Flex message JSON (single message object)
  --to          LINE userId to push (required unless --broadcast)
  --broadcast   Send via broadcast API
  --token       Channel access token. If omitted, use LINE_CHANNEL_ACCESS_TOKEN env`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--file') {
      args.file = argv[++i];
    } else if (token === '--to') {
      args.to = argv[++i];
    } else if (token === '--broadcast') {
      args.broadcast = true;
    } else if (token === '--token') {
      args.token = argv[++i];
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }
  return args;
}

async function callApi(endpoint, token, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LINE API error (${res.status}): ${text}`);
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printUsage();
      return;
    }

    const filePath = args.file ? path.resolve(args.file) : null;
    if (!filePath) {
      printUsage();
      throw new Error('--file is required');
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Flex JSON not found: ${filePath}`);
    }

    const token = args.token || process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      throw new Error('Channel access token is required. Use --token or set LINE_CHANNEL_ACCESS_TOKEN env.');
    }

  const message = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!message || typeof message !== 'object' || message.type !== 'flex') {
    throw new Error('Flex JSON must be a single Flex message object (with type: "flex").');
  }
  const resolved = applyTemplatePlaceholders(message);

  if (args.broadcast) {
    console.log(`Broadcasting Flex message from ${filePath}...`);
    await callApi(`${API_BASE}/message/broadcast`, token, { messages: [resolved] });
    console.log('✓ Broadcast sent.');
    return;
  }

    if (!args.to) {
      printUsage();
      throw new Error('Either --to or --broadcast must be specified.');
    }

  console.log(`Pushing Flex message to ${args.to} from ${filePath}...`);
  await callApi(`${API_BASE}/message/push`, token, {
    to: args.to,
    messages: [resolved]
  });
    console.log('✓ Push sent.');
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
