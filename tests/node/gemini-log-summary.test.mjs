import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPromptPayload,
  collectSanitizedLogs,
  runGeminiLogSummary,
  sanitizeLogPayload,
  callGemini,
} from '../../scripts/automation/run-gemini-log-summary.mjs';

test('sanitizeLogPayload removes raw message text', () => {
  const raw = {
    event_id: 'evt-1',
    events: [
      {
        type: 'message',
        timestamp: 123,
        source: { type: 'user', userId: 'hash' },
        message: { type: 'text', text: 'Sensitive' },
      },
    ],
  };
  const sanitized = sanitizeLogPayload(raw, 'log.json');
  assert.equal(sanitized.events[0].message_text_length, 9);
  assert.equal(sanitized.events[0].has_message_text, true);
  assert.equal(Object.hasOwn(sanitized.events[0], 'message_text_excerpt'), false);
});

test('collectSanitizedLogs returns latest files in order', async () => {
  const logs = await collectSanitizedLogs({
    inputDir: 'tests/fixtures/logs',
    limit: 1,
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event_id, 'evt-2');
});

test('runGeminiLogSummary skips when API key missing', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'gemini-'));
  const output = join(tmp, 'summary.json');
  const result = await runGeminiLogSummary({
    inputDir: 'tests/fixtures/logs',
    outputPath: output,
    apiKey: null,
  });
  assert.equal(result.status, 'skipped_missing_key');
  assert.equal(result.cost_estimate, 0);
  await rm(tmp, { recursive: true, force: true });
});

test('callGemini parses JSON response', async () => {
  const captured = {};
  const fakeFetch = async (url, init) => {
    captured.url = url;
    captured.body = init.body;
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    summary: 'All systems nominal',
                    anomalies: [],
                    observations: ['No incidents'],
                  }),
                },
              ],
            },
          },
        ],
      }),
    };
  };

  const { parsed } = await callGemini({
    apiKey: 'test-key',
    model: 'gemini-test',
    payload: { logs: [] },
    fetchImpl: fakeFetch,
  });
  assert.equal(parsed.summary, 'All systems nominal');
  assert.ok(!captured.body.includes('Sensitive'));
});

test('runGeminiLogSummary returns result when API responds', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'gemini-run-'));
  const output = join(tmp, 'summary.json');
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  summary: 'Summary text',
                  anomalies: ['A'],
                }),
              },
            ],
          },
        },
      ],
    }),
  });

  const result = await runGeminiLogSummary({
    inputDir: 'tests/fixtures/logs',
    outputPath: output,
    apiKey: 'key',
    fetchImpl: fakeFetch,
    costPerCall: 0.005,
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.cost_estimate, 0.005);
  assert.ok(result.latency_ms >= 0);
  const written = JSON.parse(await readFile(output, 'utf-8'));
  assert.equal(written.summary, 'Summary text');
  await rm(tmp, { recursive: true, force: true });
});

test('runGeminiLogSummary records cost zero for skipped logs', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'gemini-skip-'));
  const output = join(tmp, 'summary.json');
  const result = await runGeminiLogSummary({
    inputDir: 'tests/fixtures/empty',
    outputPath: output,
    apiKey: 'key',
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    costPerCall: 0.01,
  });
  assert.equal(result.cost_estimate, 0);
  await rm(tmp, { recursive: true, force: true });
});
