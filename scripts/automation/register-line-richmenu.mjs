#!/usr/bin/env node
/**
 * Register or update a LINE rich menu using JSON + image.
 *
 * Usage:
 *   node scripts/automation/register-line-richmenu.mjs \
 *     --json docs/design/line-richmenu/front-menu.json \
 *     --image dist/front-menu.png \
 *     --token "$LINE_CHANNEL_ACCESS_TOKEN" \
 *     --apply-default
 *
 * You can omit --token when LINE_CHANNEL_ACCESS_TOKEN env is set.
 * The script prints the created richMenuId and, when --apply-default is
 * passed, links it as the default rich menu for all users.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const API_BASE = 'https://api.line.me/v2/bot';

function printUsage() {
  console.log(`Usage:
  node scripts/automation/register-line-richmenu.mjs --json <path> --image <path> [--token <channel_access_token>] [--apply-default]

Options:
  --json            Path to rich menu JSON (bounds/actions definition)
  --image           PNG image file (2500x843 etc.)
  --token           Channel access token (optional if LINE_CHANNEL_ACCESS_TOKEN env set)
  --apply-default   Link the created rich menu to all users`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--json') {
      args.json = argv[++i];
    } else if (current === '--image') {
      args.image = argv[++i];
    } else if (current === '--token') {
      args.token = argv[++i];
    } else if (current === '--apply-default') {
      args.applyDefault = true;
    } else if (current === '--help' || current === '-h') {
      args.help = true;
    }
  }
  return args;
}

async function createRichMenu(token, jsonPath) {
  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const res = await fetch(`${API_BASE}/richmenu`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create rich menu (${res.status}): ${text}`);
  }
  const body = await res.json();
  const richMenuId = body.richMenuId;
  if (!richMenuId) {
    throw new Error('LINE API response missing richMenuId');
  }
  return richMenuId;
}

async function uploadImage(token, richMenuId, imagePath) {
  const buffer = fs.readFileSync(imagePath);
  const res = await fetch(`${API_BASE}/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'image/png',
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload rich menu image (${res.status}): ${text}`);
  }
}

async function linkDefault(token, richMenuId) {
  const res = await fetch(`${API_BASE}/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to link default rich menu (${res.status}): ${text}`);
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printUsage();
      return;
    }
    const jsonPath = args.json ? path.resolve(args.json) : null;
    const imagePath = args.image ? path.resolve(args.image) : null;
    if (!jsonPath || !imagePath) {
      printUsage();
      throw new Error('Both --json and --image are required');
    }
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`Rich menu JSON not found: ${jsonPath}`);
    }
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Rich menu image not found: ${imagePath}`);
    }
    const token = args.token || process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      throw new Error('Channel access token not provided. Use --token or set LINE_CHANNEL_ACCESS_TOKEN env.');
    }

    console.log(`Creating rich menu from ${jsonPath}...`);
    const richMenuId = await createRichMenu(token, jsonPath);
    console.log(`✓ Created rich menu: ${richMenuId}`);

    console.log(`Uploading image ${imagePath}...`);
    await uploadImage(token, richMenuId, imagePath);
    console.log('✓ Image uploaded');

    if (args.applyDefault) {
      console.log('Linking as default rich menu for all users...');
      await linkDefault(token, richMenuId);
      console.log('✓ Rich menu linked for all users');
    } else {
      console.log('ℹ️ Skipping default link. Use --apply-default to link automatically.');
    }

    console.log('\nDone. You can manage the rich menu via LINE Console or API.');
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
