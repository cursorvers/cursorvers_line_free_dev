#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const DEFAULT_OUTPUT_PATH = path.join(repoRoot, 'docs', 'automation', 'WORKFLOWS.md');

const HEADER = `# GitHub Actions Workflow Inventory

> 自動生成ファイル。更新する場合は \`npm run workflows:inventory\` を実行してください。

| ワークフロー | ファイル | オーナー | トリガー | 最終更新 |
| --- | --- | --- | --- | --- |
`;

function getGitMetadata(relativePath) {
  const result = spawnSync(
    'git',
    ['log', '-1', '--format=%cs %h', relativePath],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    return '未コミット';
  }
  return result.stdout.trim() || '未コミット';
}

function formatTriggers(triggerList) {
  if (!Array.isArray(triggerList) || triggerList.length === 0) return '—';
  return triggerList
    .map((item) => item.replace(/_/g, ' '))
    .join(', ');
}

function extractSimple(field, content) {
  const regex = new RegExp(`^${field}\\s*:\\s*(.+)$`, 'm');
  const match = content.match(regex);
  return match ? match[1].trim() : undefined;
}

function tryParseOnBlock(content) {
  const lines = content.split(/\r?\n/);
  const block = [];
  let capturing = false;
  let baseIndent = 0;

  for (const line of lines) {
    if (!capturing) {
      const match = line.match(/^(\s*)on\s*:/);
      if (match) {
        capturing = true;
        baseIndent = match[1]?.length ?? 0;
        block.push(line);
      }
      continue;
    }

    const indentMatch = line.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0].length : 0;
    const trimmed = line.trim();
    if (trimmed.length && indent <= baseIndent && !trimmed.startsWith('#')) {
      break;
    }
    block.push(line);
  }

  if (block.length === 0) return undefined;

  const triggers = new Set();
  const [firstLine, ...rest] = block;
  const inline = firstLine.split(':').slice(1).join(':').trim();
  if (inline) {
    if (inline.startsWith('[') && inline.endsWith(']')) {
      inline
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => triggers.add(item.replace(/['"]/g, '')));
    } else {
      triggers.add(inline.replace(/['"]/g, ''));
    }
  }

  let childIndent = null;
  for (const line of rest) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.search(/\S/);
    if (indent <= baseIndent) break;

    if (childIndent === null) {
      childIndent = indent;
    }
    if (indent !== childIndent) continue;

    if (trimmed.startsWith('-')) {
      const value = trimmed.replace(/^-+\s*/, '');
      if (value) triggers.add(value.replace(/['"]/g, ''));
      continue;
    }

    const keyMatch = trimmed.match(/^([A-Za-z0-9_\-]+)\s*:/);
    if (keyMatch) {
      triggers.add(keyMatch[1]);
      continue;
    }
  }

  if (triggers.size === 0) return undefined;
  return Array.from(triggers);
}

export async function generateWorkflowInventory({ outputPath = DEFAULT_OUTPUT_PATH, dryRun = false } = {}) {
  const entries = await fs.readdir(workflowsDir);
  const rows = [];

  for (const file of entries.sort()) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
    const fullPath = path.join(workflowsDir, file);
    const content = await fs.readFile(fullPath, 'utf8');
    const name = extractSimple('name', content) ?? path.basename(file, path.extname(file));
    const owner = extractSimple('x-owner', content) ?? 'unspecified';
    const rawTriggers = tryParseOnBlock(content);
    const triggers = formatTriggers(rawTriggers);
    const relativePath = path.posix.join('.github', 'workflows', file);
    const gitMeta = getGitMetadata(relativePath);

    rows.push({
      name,
      owner,
      triggers,
      relativePath,
      gitMeta,
      file: file,
      triggersList: rawTriggers ?? [],
    });
  }

  const bodyLines = rows.map(({ name, owner, triggers, relativePath, gitMeta }) => {
      const link = `[${name}](../../${relativePath})`;
      return `| ${link} | \`${relativePath}\` | ${owner} | ${triggers} | ${gitMeta} |`;
    });

  const markdown = `${HEADER}${bodyLines.join('\n')}\n`;

  if (!dryRun) {
    await fs.writeFile(outputPath, markdown, 'utf8');
  }

  return { rows, markdown, outputPath };
}

async function main() {
  try {
    await generateWorkflowInventory();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (executedPath && executedPath === import.meta.url) {
  main();
}
