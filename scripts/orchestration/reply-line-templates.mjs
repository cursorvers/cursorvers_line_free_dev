#!/usr/bin/env node
/**
 * Send LINE replies based on spec evaluation results and pre-built templates.
 *
 * Example:
 *   node scripts/orchestration/reply-line-templates.mjs \
 *     --event tmp/event.json \
 *     --evaluation tmp/orchestration/spec-evaluation.json \
 *     --templates config/line/templates \
 *     --token "$LINE_CHANNEL_ACCESS_TOKEN"
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyTemplatePlaceholders } from '../lib/line.js';
import { fetchUserState, updateUserMetadata } from './user-state.mjs';
import { evaluateBroadcastPolicy } from './broadcast-limits.mjs';

const API_BASE = 'https://api.line.me/v2/bot';

function printUsage() {
  console.log(`Usage:
  node scripts/orchestration/reply-line-templates.mjs --event <path> --evaluation <path> --templates <dir> --token <channel_access_token> [--dry-run] [--log <path>]

Options:
  --event       Path to sanitized LINE payload (repository_dispatch payload)
  --evaluation  Path to spec evaluation JSON (output of evaluate-line-event.mjs)
  --templates   Directory containing compiled templates (default: config/line/templates)
  --token       LINE channel access token
  --dry-run     Log actions without calling the LINE API
  --log         File path to write JSON log entries`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--event') {
      args.eventPath = argv[++i];
    } else if (token === '--evaluation') {
      args.evaluationPath = argv[++i];
    } else if (token === '--templates') {
      args.templatesDir = argv[++i];
    } else if (token === '--token') {
      args.token = argv[++i];
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--log') {
      args.logPath = argv[++i];
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }
  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectTemplates(triggered = []) {
  const templates = new Set();
  for (const entry of triggered) {
    const operations = Array.isArray(entry.operations) ? entry.operations : [];
    for (const op of operations) {
      if (op?.type === 'send_message' && op.payload?.template) {
        templates.add(op.payload.template);
      }
    }
  }
  return Array.from(templates);
}

function loadTemplateMessages(templateName, templatesDir) {
  const templatePath = path.join(templatesDir, `${templateName}.json`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const template = loadJson(templatePath);
  const base = Array.isArray(template.messages) ? template.messages : Array.isArray(template) ? template : null;
  if (base) {
    return applyTemplatePlaceholders(base);
  }
  throw new Error(`Template ${templatePath} does not contain "messages" array.`);
}

function requiresBroadcastGuard(templateNames = []) {
  return templateNames.some((name) => name.startsWith('scenario_cmd'));
}

function resolveUserHash(event) {
  return event?.source?.userId ?? event?.user?.hashed_id ?? null;
}

function resolveEventId(event, index) {
  return (
    event?.message?.id ??
    event?.webhookEventId ??
    event?.replyToken ??
    `event-${index}`
  );
}

async function sendReply(token, replyToken, messages) {
  const res = await fetch(`${API_BASE}/message/reply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      replyToken,
      messages
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to send reply (${res.status}): ${text}`);
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printUsage();
      return;
    }

    const eventPath = args.eventPath ? path.resolve(args.eventPath) : null;
    const evaluationPath = args.evaluationPath ? path.resolve(args.evaluationPath) : null;
    const templatesDir = path.resolve(args.templatesDir ?? 'config/line/templates');

    if (!eventPath || !evaluationPath) {
      printUsage();
      throw new Error('--event and --evaluation are required');
    }
    if (!fs.existsSync(eventPath)) {
      throw new Error(`Event payload not found: ${eventPath}`);
    }
    if (!fs.existsSync(evaluationPath)) {
      throw new Error(`Evaluation file not found: ${evaluationPath}`);
    }
    if (!fs.existsSync(templatesDir)) {
      throw new Error(`Templates directory not found: ${templatesDir}`);
    }

    const token = args.token || process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token && !args.dryRun) {
      throw new Error('Channel access token missing. Provide via --token or LINE_CHANNEL_ACCESS_TOKEN env.');
    }

    const payload = loadJson(eventPath);
    const evaluation = loadJson(evaluationPath);
    const events = Array.isArray(payload.events) ? payload.events : [];
    const results = Array.isArray(evaluation.results) ? evaluation.results : [];

    const logEntries = [];

    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      const result = results[i] ?? {};
      const templates = collectTemplates(result.triggered);
      if (templates.length === 0) {
        continue;
      }
      if (Array.isArray(result.violations) && result.violations.length > 0) {
        logEntries.push({
          event_id: resolveEventId(event, i),
          user_hash: resolveUserHash(event),
          templates,
          dry_run: !!args.dryRun,
          status: 'skipped_violation',
          reason: 'constraint_violation',
          timestamp: new Date().toISOString(),
          violations: result.violations
        });
        console.warn(`Skipping event ${i} (${result.event}) due to constraint violations.`);
        continue;
      }
      const replyToken = event?.replyToken ?? null;
      if (!replyToken) {
          logEntries.push({
            event_id: resolveEventId(event, i),
            user_hash: resolveUserHash(event),
            templates,
            dry_run: !!args.dryRun,
            status: 'skipped_missing_reply_token',
            reason: 'reply_token_missing',
            timestamp: new Date().toISOString()
          });
        console.warn(`Skipping event ${i} (${result.event}) because replyToken is missing.`);
        continue;
      }

      const messages = [];
      for (const templateName of templates) {
        const templateMessages = loadTemplateMessages(templateName, templatesDir);
        messages.push(...templateMessages);
      }

      if (messages.length === 0) {
        continue;
      }

      const userHash = resolveUserHash(event);
      let metadataPatch = null;
      let broadcastInfo = null;
      if (!args.dryRun && requiresBroadcastGuard(templates) && userHash) {
        try {
          const userState = await fetchUserState(userHash);
          const policy = evaluateBroadcastPolicy({
            metadata: userState.raw?.metadata ?? {},
            templateNames: templates,
          });
          broadcastInfo = policy;
          if (!policy.allowed) {
            logEntries.push({
              event_id: resolveEventId(event, i),
              user_hash: userHash,
              templates,
              dry_run: !!args.dryRun,
              status: 'skipped_broadcast_policy',
              reason: policy.reason,
              timestamp: new Date().toISOString(),
              broadcast: policy
            });
            console.warn(`Skipping event ${i} due to broadcast policy (${policy.reason}).`);
            continue;
          }
          metadataPatch = policy.metadataPatch;
        } catch (error) {
          broadcastInfo = { error: error.message };
          console.warn(`Broadcast policy check failed for event ${i}: ${error.message}`);
        }
      }

      if (messages.length > 5) {
        console.warn(`Template set for event ${i} exceeds 5 messages. Trimming to 5.`);
        messages.length = 5;
      }

      const logEntry = {
        event_id: resolveEventId(event, i),
        user_hash: userHash,
        templates,
        dry_run: !!args.dryRun,
        timestamp: new Date().toISOString(),
        broadcast: broadcastInfo
      };

      if (args.dryRun) {
        console.log(`[dry-run] Would reply to ${replyToken.slice(0, 6)}... with templates ${templates.join(', ')}`);
        logEntry.status = 'dry_run';
        logEntry.reason = 'dry_run';
        logEntries.push(logEntry);
        continue;
      }

      try {
        await sendReply(token, replyToken, messages);
        logEntry.status = 'sent';
        logEntry.reason = 'ok';
        console.log(`✓ Sent templates ${templates.join(', ')} for event ${i} (${result.event})`);
        if (metadataPatch && userHash) {
          try {
            await updateUserMetadata(userHash, metadataPatch);
            logEntry.metadata_updated = true;
          } catch (error) {
            logEntry.metadata_updated = false;
            logEntry.metadata_update_error = error.message;
            console.warn(`Failed to update metadata for ${userHash}: ${error.message}`);
          }
        }
      } catch (error) {
        logEntry.status = 'error';
        logEntry.reason = error.message;
        logEntries.push(logEntry);
        throw error;
      }

      logEntries.push(logEntry);
    }

    if (args.logPath) {
      const logDir = path.dirname(path.resolve(args.logPath));
      fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(path.resolve(args.logPath), JSON.stringify({ entries: logEntries }, null, 2));
    }
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
