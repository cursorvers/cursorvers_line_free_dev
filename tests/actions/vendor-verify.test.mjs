import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { computeSha, syncVendor } from '../../scripts/vendor/sync.mjs';

const repoRoot = path.resolve('tmp', 'vendor-test');
const manifestPath = path.join(repoRoot, 'manifest.json');
const targetDir = path.join(repoRoot, 'vendor');
const targetFile = path.join(targetDir, 'sample.txt');

async function setupManifest(content) {
  await rm(repoRoot, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await writeFile(targetFile, content, 'utf8');
  const sha = computeSha(Buffer.from(content));
  const manifest = {
    version: 1,
    items: [
      {
        id: 'sample',
        target: 'vendor/sample.txt',
        sha256: sha,
      },
    ],
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

test('syncVendor verifyOnly detects mismatches', async () => {
  const manifest = await setupManifest('original');
  const result = await syncVendor({
    manifestPath,
    repoRoot,
    verifyOnly: true,
  });
  assert.equal(result.mismatches.length, 0);

  await writeFile(targetFile, 'modified', 'utf8');
  const mismatchResult = await syncVendor({
    manifestPath,
    repoRoot,
    verifyOnly: true,
  });
  assert.equal(mismatchResult.mismatches.length, 1);
  assert.equal(mismatchResult.mismatches[0].id, manifest.items[0].id);
});
