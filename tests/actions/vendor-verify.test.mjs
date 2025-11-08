import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { computeSha, syncVendor } from '../../scripts/vendor/sync.mjs';

const repoRoot = path.resolve('tmp', 'vendor-test');
const manifestPath = path.join(repoRoot, 'manifest.json');
const lockPath = path.join(repoRoot, 'manifest.lock.json');
const targetDir = path.join(repoRoot, 'vendor');
const targetFile = path.join(targetDir, 'sample.txt');

async function setupManifest(content, { createLock = true } = {}) {
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
  if (createLock) {
    const iso = new Date(0).toISOString();
    const lock = {
      version: manifest.version,
      generated_at: iso,
      items: [
        {
          id: manifest.items[0].id,
          target: manifest.items[0].target,
          sha256: sha,
          size: Buffer.byteLength(content),
          last_synced_at: iso,
        },
      ],
    };
    await writeFile(lockPath, JSON.stringify(lock, null, 2), 'utf8');
  }
  return manifest;
}

test('syncVendor verifyOnly detects mismatches', async () => {
  const manifest = await setupManifest('original');
  const result = await syncVendor({
    manifestPath,
    lockPath,
    repoRoot,
    verifyOnly: true,
  });
  assert.equal(result.mismatches.length, 0);

  await writeFile(targetFile, 'modified', 'utf8');
  const mismatchResult = await syncVendor({
    manifestPath,
    lockPath,
    repoRoot,
    verifyOnly: true,
  });
  assert.ok(
    mismatchResult.mismatches.some((entry) => entry.id === manifest.items[0].id),
    'mismatch reported for modified file'
  );
});

test('syncVendor verifyOnly reports missing lock entry', async () => {
  await setupManifest('content', { createLock: false });
  const result = await syncVendor({
    manifestPath,
    lockPath,
    repoRoot,
    verifyOnly: true,
  });
  assert.equal(result.mismatches.length, 1);
  assert.match(result.mismatches[0].error ?? '', /lock entry missing/);
});

test('syncVendor verifyOnly flags lock-only entries', async () => {
  await setupManifest('content');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  lock.items.push({
    id: 'stale-entry',
    target: 'vendor/stale.txt',
    sha256: lock.items[0].sha256,
    size: 0,
    last_synced_at: new Date(0).toISOString(),
  });
  await writeFile(lockPath, JSON.stringify(lock, null, 2), 'utf8');

  const result = await syncVendor({
    manifestPath,
    lockPath,
    repoRoot,
    verifyOnly: true,
  });

  assert.ok(
    result.mismatches.some(
      (entry) => entry.id === 'stale-entry' && /not present/i.test(entry.error ?? '')
    ),
    'reports lock entries not declared in manifest'
  );
});

test('syncVendor updates manifest and lock from remote source', async () => {
  await rm(repoRoot, { recursive: true, force: true });
  await mkdir(repoRoot, { recursive: true });

  const manifest = {
    version: 1,
    items: [
      {
        id: 'sample',
        source: 'https://example.com/sample.txt',
        target: 'vendor/sample.txt',
      },
    ],
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const payload = Buffer.from('hello world');
  const arrayBuffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => arrayBuffer,
  });

  const result = await syncVendor({
    manifestPath,
    lockPath,
    repoRoot,
    fetchImpl: fakeFetch,
  });

  assert.deepEqual(
    result.updates.map((entry) => entry.id),
    ['sample'],
    'returns updated entries'
  );

  const manifestAfter = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(
    manifestAfter.items[0].sha256,
    computeSha(payload),
    'manifest sha updated'
  );

  const lockAfter = JSON.parse(await readFile(lockPath, 'utf8'));
  assert.equal(lockAfter.items.length, 1);
  assert.equal(lockAfter.items[0].sha256, manifestAfter.items[0].sha256);
  assert.equal(lockAfter.items[0].size, payload.length);
  assert.ok(
    Number.isFinite(new Date(lockAfter.items[0].last_synced_at).getTime()),
    'lock includes timestamp'
  );
});
