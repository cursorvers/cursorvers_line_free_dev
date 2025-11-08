import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runGeminiLogSummary } from '../../scripts/automation/run-gemini-log-summary.mjs';

function createFakeFetch(summaryText) {
  return async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    summary: summaryText,
                    anomalies: ['none'],
                    observations: [],
                  }),
                },
              ],
            },
          },
        ],
      };
    },
  });
}

test('runGeminiLogSummary writes outputs and metrics', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'gemini-summary-'));
  try {
    const logsDir = path.join(tempRoot, 'logs', 'progress');
    await mkdir(logsDir, { recursive: true });
    const logPath = path.join(logsDir, 'event-1.json');
    await writeFile(
      logPath,
      JSON.stringify({
        event_id: 'evt-123',
        received_at: '2024-01-01T00:00:00Z',
        events: [
          {
            type: 'follow',
            timestamp: 1700000000,
            source: { type: 'user', userId: 'hash-123' },
            message: { type: 'text', text: 'hello' },
          },
        ],
      }),
      'utf-8'
    );

    const outputPath = path.join(tempRoot, 'tmp', 'gemini', 'log-summary.json');
    const metricsPath = path.join(tempRoot, 'logs', 'metrics', 'gemini', '20240101.jsonl');

    const result = await runGeminiLogSummary({
      inputDir: logsDir,
      outputPath,
      apiKey: 'test-key',
      fetchImpl: createFakeFetch('All systems nominal.'),
      costPerCall: 0.02,
      metricsPath,
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.logs_count, 1);
    assert.ok(result.duration_ms >= 0);

    const summary = JSON.parse(await readFile(outputPath, 'utf-8'));
    assert.equal(summary.status, 'ok');
    assert.equal(summary.summary, 'All systems nominal.');

    const metricsContent = await readFile(metricsPath, 'utf-8');
    const lines = metricsContent.trim().split('\n');
    assert.equal(lines.length, 1);
    const metricsRecord = JSON.parse(lines[0]);
    assert.equal(metricsRecord.status, 'ok');
    assert.equal(metricsRecord.logs_count, 1);
    assert.ok(metricsRecord.duration_ms >= 0);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('runGeminiLogSummary supports CLI driver', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'gemini-cli-'));
  try {
    const logsDir = path.join(tempRoot, 'logs', 'progress');
    await mkdir(logsDir, { recursive: true });
    const logPath = path.join(logsDir, 'event-2.json');
    await writeFile(logPath, JSON.stringify({ events: [] }), 'utf-8');

    const fakeCliPath = path.join(tempRoot, 'fake-gemini-cli.mjs');
    await writeFile(fakeCliPath, `#!/usr/bin/env node
import { stdin, stdout } from 'node:process';
let data = '';
stdin.on('data', (chunk) => (data += chunk));
stdin.on('end', () => {
  try {
    JSON.parse(data);
  } catch (error) {
    console.error('invalid json', error);
    process.exit(1);
  }
  stdout.write(JSON.stringify({
    summary: 'CLI generated summary',
    anomalies: [],
    observations: ['cli-driver']
  }));
});
`, 'utf-8');
    await chmod(fakeCliPath, 0o755);

    const outputPath = path.join(tempRoot, 'tmp', 'gemini', 'cli-summary.json');
    const metricsPath = path.join(tempRoot, 'logs', 'metrics', 'gemini', '20240102.jsonl');
    const cliWorkspace = path.join(tempRoot, '.gemini-workspace');

    const result = await runGeminiLogSummary({
      inputDir: logsDir,
      outputPath,
      metricsPath,
      apiKey: 'cli-key',
      driver: 'cli',
      cliPath: fakeCliPath,
      cliWorkspaceDir: cliWorkspace,
    });

    const summary = JSON.parse(await readFile(outputPath, 'utf-8'));
    assert.equal(summary.summary, 'CLI generated summary');
    assert.equal(result.summary, 'CLI generated summary');
    const metricsContent = await readFile(metricsPath, 'utf-8');
    assert.ok(metricsContent.includes('"status":"ok"'));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
