#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'manifest.json');

export function computeSha(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function ensureDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function syncVendor({
  manifestPath = DEFAULT_MANIFEST_PATH,
  repoRoot = DEFAULT_REPO_ROOT,
  verifyOnly = false,
  fetchImpl,
} = {}) {
  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const mismatches = [];
  const updates = [];
  const fetcher = fetchImpl ?? globalThis.fetch;

  for (const item of manifest.items) {
    const targetPath = path.join(repoRoot, item.target);

    if (verifyOnly) {
      try {
        const data = await readFile(targetPath);
        const hash = computeSha(data);
        if (hash !== item.sha256) {
          mismatches.push({ id: item.id, expected: item.sha256, actual: hash });
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
    item.sha256 = computeSha(buffer);
    updates.push({ id: item.id, targetPath });
  }

  if (verifyOnly) {
    return { mismatches, updates: [] };
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
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
