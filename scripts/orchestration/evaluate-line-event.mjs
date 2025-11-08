#!/usr/bin/env node
/**
 * Evaluate a LINE event payload against codex.spec.yaml and surface constraint violations.
 *
 * Usage:
 *   node scripts/orchestration/evaluate-line-event.mjs \
 *     --event tmp/event.json \
 *     --spec codex.spec.yaml \
 *     --output tmp/orchestration/result.json
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadRuleEngine } from './execute-rules.mjs';
import { deriveLineSpecEvent } from './line-event-mapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Evaluate one or more LINE webhook events using the provided rule engine.
 *
 * @param {ReturnType<typeof createRuleEngine>} engine - Rule engine instance.
 * @param {Array<Object>} events - Raw LINE webhook events (array from LINE payload).
 * @param {Object} options - Evaluation options.
 * @param {Array<string>} options.userTags - Known user tags (optional).
 * @returns {{results: Array, blocked: boolean}}
 */
export function evaluateLineEvents(engine, events = [], options = {}) {
  if (!engine || typeof engine.evaluate !== 'function') {
    throw new Error('Rule engine is required to evaluate events');
  }
  const resolvedEvents = Array.isArray(events) ? events : [];
  const results = [];

  for (const rawEvent of resolvedEvents) {
    const { eventName, command } = deriveLineSpecEvent(rawEvent);
    const message = rawEvent?.message ?? null;
    const rawText = message?.raw_text ?? message?.text ?? null;

    const evaluation = engine.evaluate({
      event: eventName,
      user: { tags: options.userTags ?? [] },
      payload: {
        command,
        text: rawText,
        rawText,
        message,
        replyToken: rawEvent?.replyToken ?? null,
        original: rawEvent
      },
      meta: {
        links: extractLinksFromMessage(message)
      }
    });

    results.push({
      event: eventName,
      command,
      triggered: evaluation.triggered ?? [],
      violations: evaluation.violations ?? [],
      limits: evaluation.triggered?.map((entry) => entry.limits) ?? []
    });
  }

  const blocked = results.some((entry) =>
    entry.violations.some((violation) =>
      (violation.constraints ?? []).some((constraint) => {
        const action = constraint?.details?.action ?? 'flag';
        return action !== 'log_only';
      })
    )
  );

  return { results, blocked };
}

function extractLinksFromMessage(message) {
  if (!message || typeof message !== 'object') {
    return [];
  }
  const candidates = new Set();
  const pushIfUrl = (value) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return;
    }
    candidates.add(trimmed);
  };

  pushIfUrl(message?.link);
  pushIfUrl(message?.url);
  pushIfUrl(message?.raw_text);
  pushIfUrl(message?.text);

  return Array.from(candidates);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--event') {
      args.eventPath = argv[i + 1];
      i += 1;
    } else if (token === '--spec') {
      args.specPath = argv[i + 1];
      i += 1;
    } else if (token === '--output') {
      args.outputPath = argv[i + 1];
      i += 1;
    } else if (token === '--user-tags') {
      const value = argv[i + 1] ?? '';
      args.userTags = value.split(',').map((tag) => tag.trim()).filter(Boolean);
      i += 1;
    }
  }
  return args;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const eventPath = resolvePath(args.eventPath ?? 'tmp/event.json');
    const specPath = resolvePath(args.specPath ?? path.join(PROJECT_ROOT, 'codex.spec.yaml'));
    const outputPath = args.outputPath ? resolvePath(args.outputPath) : null;

    if (!fs.existsSync(eventPath)) {
      console.warn(`⚠️ Event payload not found at ${eventPath}. Skipping spec evaluation.`);
      return;
    }
    if (!fs.existsSync(specPath)) {
      console.warn(`⚠️ Spec file not found at ${specPath}. Skipping spec evaluation.`);
      return;
    }

    const rawPayload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const events = Array.isArray(rawPayload?.events) ? rawPayload.events : [];
    if (events.length === 0) {
      console.log('ℹ️ No LINE events detected in payload. Nothing to evaluate.');
      return;
    }

    const engine = await loadRuleEngine(specPath);
    const evaluation = evaluateLineEvents(engine, events, { userTags: args.userTags });

    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(evaluation, null, 2));
    }

    const summary = {
      evaluated_events: events.length,
      triggered_rules: evaluation.results.reduce((sum, entry) => sum + (entry.triggered?.length ?? 0), 0),
      violations: evaluation.results
        .flatMap((entry) => entry.violations)
        .flatMap((violation) => violation.constraints ?? []),
    };

    if (summary.violations.length > 0) {
      console.error('❌ Constraint violations detected during spec evaluation.');
      console.error(JSON.stringify(summary, null, 2));
    } else {
      console.log('✅ Spec evaluation completed without violations.');
      console.log(JSON.stringify(summary, null, 2));
    }

    if (evaluation.blocked) {
      throw new Error('One or more constraint violations require blocking the event.');
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exit(1);
  }
}

function resolvePath(input) {
  if (!input) {
    return null;
  }
  if (path.isAbsolute(input)) {
    return input;
  }
  return path.join(process.cwd(), input);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
