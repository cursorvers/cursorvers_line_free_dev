import assert from 'node:assert/strict';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { archiveFiles } from '../../scripts/logs/archive.mjs';

const repoRoot = path.resolve();

const TEST_TMP_DIR = path.join(repoRoot, 'tmp', 'unit-tests');

async function setupLogFile() {
  await mkdir(TEST_TMP_DIR, { recursive: true });
  const filePath = path.join(TEST_TMP_DIR, 'sample-log.json');
  await writeFile(filePath, JSON.stringify({ ok: true }), 'utf8');
  return filePath;
}

async function cleanup(dir) {
  await rm(dir, { recursive: true, force: true });
}

test('archiveFiles copies logs into artifact directory', async () => {
  const logPath = await setupLogFile();
  const { artifactName, artifactDir } = await archiveFiles({ files: [logPath], label: 'Line Event' });

  assert.match(artifactName, /^line-event-\d{14}$/);
  const copied = await readFile(path.join(artifactDir, '00_sample-log.json'), 'utf8');
  assert.equal(JSON.parse(copied).ok, true);

  await cleanup(artifactDir);
  await cleanup(TEST_TMP_DIR);
});
