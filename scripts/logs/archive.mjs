#!/usr/bin/env node
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--files') {
      args.files = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--label') {
      args.label = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function splitPaths(value = '') {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sanitizeLabel(label = 'progress-log') {
  const cleaned = label
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'progress-log';
}

export async function archiveFiles({ files, label }) {
  if (!files) {
    throw new Error('No files provided to archive');
  }
  const paths = Array.isArray(files) ? files : splitPaths(files);
  if (paths.length === 0) {
    throw new Error('Resolved file list is empty');
  }

  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const artifactName = `${sanitizeLabel(label)}-${timestamp}`;
  const artifactDir = path.join(repoRoot, 'tmp', 'log-artifacts', artifactName);
  await mkdir(artifactDir, { recursive: true });

  let index = 0;
  for (const relative of paths) {
    const absolute = path.isAbsolute(relative) ? relative : path.join(repoRoot, relative);
    const targetName = `${index.toString().padStart(2, '0')}_${path.basename(relative)}`;
    const destination = path.join(artifactDir, targetName);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(absolute, destination);
    index += 1;
  }

  return { artifactName, artifactDir };
}

async function main() {
  const { files, label } = parseArgs(process.argv.slice(2));
  const result = await archiveFiles({ files, label });
  console.log(`artifact_name=${result.artifactName}`);
  console.log(`artifact_path=${result.artifactDir}`);
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (executedPath && executedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
