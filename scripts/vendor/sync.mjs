#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'manifest.json');
const DEFAULT_LOCK_PATH = path.join(__dirname, 'manifest.lock.json');

export function computeSha(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function ensureDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function toISODate() {
  return new Date().toISOString();
}

function sortLockItems(items = []) {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

export async function syncVendor({
  manifestPath = DEFAULT_MANIFEST_PATH,
  lockPath = DEFAULT_LOCK_PATH,
  repoRoot = DEFAULT_REPO_ROOT,
  verifyOnly = false,
  fetchImpl,
} = {}) {
  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  let lock = { version: manifest.version ?? 1, generated_at: null, items: [] };

  try {
    const lockRaw = await readFile(lockPath, 'utf8');
    lock = JSON.parse(lockRaw);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const lockMap = new Map(
    Array.isArray(lock.items)
      ? lock.items.map((entry) => [entry.id, entry])
      : []
  );

  const mismatches = [];
  const updates = [];
  const fetcher = fetchImpl ?? globalThis.fetch;
  const seenIds = new Set();

  for (const item of manifest.items) {
    const targetPath = path.join(repoRoot, item.target);
    const lockEntry = lockMap.get(item.id);
    seenIds.add(item.id);

    if (verifyOnly) {
      try {
        const data = await readFile(targetPath);
        const hash = computeSha(data);
        const expectedSha = lockEntry?.sha256 ?? item.sha256;
        if (!lockEntry) {
          mismatches.push({ id: item.id, error: 'lock entry missing' });
        } else if (hash !== lockEntry.sha256) {
          mismatches.push({ id: item.id, expected: lockEntry.sha256, actual: hash });
        }
        if (lockEntry && lockEntry.target !== item.target) {
          mismatches.push({
            id: item.id,
            error: `lock target ${lockEntry.target} differs from manifest target ${item.target}`,
          });
        }
        if (lockEntry && typeof lockEntry.size === 'number' && lockEntry.size !== data.length) {
          mismatches.push({
            id: item.id,
            error: `lock size ${lockEntry.size} differs from file size ${data.length}`,
          });
        }
        if (item.sha256 && expectedSha && item.sha256 !== expectedSha) {
          mismatches.push({
            id: item.id,
            error: `manifest sha ${item.sha256} differs from lock sha ${expectedSha}`,
          });
        }
      } catch (error) {
        mismatches.push({ id: item.id, error: error.message });
      }
      continue;
    }

    if (typeof fetcher !== 'function') {
      throw new Error('fetch implementation is not available; provide fetchImpl option');
    }

    const response = await fetcher(item.source);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${item.source}: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await ensureDir(targetPath);
    await writeFile(targetPath, buffer);
    const sha256 = computeSha(buffer);
    item.sha256 = sha256;
    const entry = {
      id: item.id,
      target: item.target,
      sha256,
      size: buffer.byteLength,
      last_synced_at: toISODate(),
    };
    lockMap.set(item.id, entry);
    updates.push({ id: item.id, targetPath });
  }

  if (verifyOnly) {
    for (const id of lockMap.keys()) {
      if (!seenIds.has(id)) {
        mismatches.push({ id, error: 'lock entry not present in manifest' });
      }
    }
    return { mismatches, updates: [] };
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const lockPayload = {
    version: manifest.version ?? 1,
    generated_at: toISODate(),
    items: sortLockItems(Array.from(lockMap.values())),
  };
  await writeFile(lockPath, `${JSON.stringify(lockPayload, null, 2)}\n`, 'utf8');
  return { mismatches: [], updates, manifest };
}

async function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes('--verify');

  try {
    const result = await syncVendor({ verifyOnly });
    if (verifyOnly) {
      if (result.mismatches.length > 0) {
        console.error('Vendor verification failed:');
        for (const mismatch of result.mismatches) {
          if (mismatch.error) {
            console.error(`- ${mismatch.id}: ${mismatch.error}`);
          } else {
            console.error(`- ${mismatch.id}: expected ${mismatch.expected}, got ${mismatch.actual}`);
          }
        }
        process.exitCode = 1;
      } else {
        console.log('Vendor verification passed.');
      }
    } else {
      result.updates.forEach((update) => {
        console.log(`✔ Updated ${update.id}`);
      });
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (executedPath && executedPath === __filename) {
  main();
}
