#!/usr/bin/env node
/**
 * Send a multi-message scenario (text + flex + quick replies) via LINE Messaging API.
 *
 * Usage:
 *   node scripts/automation/send-line-scenario.mjs \
 *     --scenario docs/design/line-richmenu/scenarios/scenario_add_line.json \
 *     --to Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
 *     --token "$LINE_CHANNEL_ACCESS_TOKEN"
 *
 * Scenario JSON format:
 * {
 *   "messages": [
 *     {
 *       "type": "text",
 *       "text": "こんにちは！",
 *       "quickReply": "../quick-reply.json"
 *     },
 *     { "flex": "../flex-welcome.json" }
 *   ]
 * }
 *
 * Supported keys:
 *  - type/text/...: raw LINE message object (if quickReply is a string it will be expanded)
 *  - flex: path to a Flex message JSON file (the JSON must be a single Flex object)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyTemplatePlaceholders } from '../lib/line.js';

const API_BASE = 'https://api.line.me/v2/bot';

function printUsage() {
  console.log(`Usage:
  node scripts/automation/send-line-scenario.mjs --scenario <file> [--to <userId> | --broadcast] [--token <access_token>]

Options:
  --scenario     Scenario JSON (see docs/design/line-richmenu/scenarios/*.json)
  --to           Target userId (push message)
  --broadcast    Use broadcast API
  --token        Channel access token (fallback: LINE_CHANNEL_ACCESS_TOKEN env)
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--scenario') {
      args.scenario = argv[++i];
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

function loadJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
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
  // Remove helper keys in case they exist.
  delete message.flex;
  return message;
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
    const scenarioPath = args.scenario ? path.resolve(args.scenario) : null;
    if (!scenarioPath) {
      printUsage();
      throw new Error('--scenario is required');
    }
    if (!fs.existsSync(scenarioPath)) {
      throw new Error(`Scenario file not found: ${scenarioPath}`);
    }

    const token = args.token || process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      throw new Error('Channel access token missing. Use --token or set LINE_CHANNEL_ACCESS_TOKEN env.');
    }

    const scenario = loadJson(scenarioPath);
    if (!Array.isArray(scenario.messages)) {
      throw new Error('Scenario JSON must contain a "messages" array.');
    }
    const baseDir = path.dirname(scenarioPath);
    const messages = scenario.messages.map((descriptor) => resolveMessage(descriptor, baseDir));
    const resolvedMessages = applyTemplatePlaceholders(messages);

    if (args.broadcast) {
      console.log(`Broadcasting scenario ${scenarioPath} (${messages.length} message(s))...`);
      await callApi(`${API_BASE}/message/broadcast`, token, { messages: resolvedMessages });
      console.log('✓ Broadcast complete.');
      return;
    }

    if (!args.to) {
      printUsage();
      throw new Error('Either --to or --broadcast must be provided.');
    }

    console.log(`Pushing scenario ${scenarioPath} to ${args.to} (${messages.length} message(s))...`);
    await callApi(`${API_BASE}/message/push`, token, { to: args.to, messages: resolvedMessages });
    console.log('✓ Push complete.');
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
