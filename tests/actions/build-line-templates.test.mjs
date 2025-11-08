import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

function execNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile('node', args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

test('build-line-templates resolves quick reply files', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'line-templates-'));
  try {
    await execNode([
      'scripts/automation/build-line-templates.mjs',
      '--src',
      'tests/fixtures/line-richmenu/scenarios',
      '--dest',
      outDir
    ]);
    const outputPath = path.join(outDir, 'scenario_test.json');
    const content = JSON.parse(await readFile(outputPath, 'utf-8'));
    assert.equal(content.description, 'Quick reply scenario fixture');
    const message = content.messages[0];
    assert.equal(message.text, 'テストメッセージ');
    assert.ok(message.quickReply);
    assert.equal(message.quickReply.items.length, 1);
    assert.equal(message.quickReply.items[0].action.text, '詳細を見せて');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
