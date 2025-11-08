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

| ワークフロー | ファイル | オーナー | パーミッション | トリガー | 最終更新 |
| --- | --- | --- | --- | --- | --- |
`;
const ROUTER_POLICY = `
## Router Policy

- \`webhook-handler.yml\` is the canonical event router; all GitHub webhooks for this repository should flow through it.
- Routing logic lives in \`scripts/webhook-router.mjs\`, which manages issue state labels and responds to \`/state <value>\` comment commands.
- Non-issue events currently emit telemetry summaries only; extend the router script when additional automation is required.
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

function captureIndentedBlock(field, content) {
  const lines = content.split(/\r?\n/);
  const block = [];
  let capturing = false;
  let baseIndent = 0;

  for (const line of lines) {
    if (!capturing) {
      const match = line.match(new RegExp(`^(\\s*)${field}\\s*:`));
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
  return { block, baseIndent };
}

function tryParseOnBlock(content) {
  const captured = captureIndentedBlock('on', content);
  if (!captured) return undefined;
  const { block, baseIndent } = captured;

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

function tryParsePermissions(content) {
  const captured = captureIndentedBlock('permissions', content);
  if (!captured) return undefined;
  const { block, baseIndent } = captured;
  const [firstLine, ...rest] = block;
  const inline = firstLine.split(':').slice(1).join(':').trim();
  if (inline) {
    return inline.replace(/['"]/g, '');
  }

  const map = new Map();
  for (const line of rest) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);
    if (indent <= baseIndent) break;
    const match = line.trim().match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = (match[2] ?? '')
      .replace(/['"]/g, '')
      .replace(/\s+#.*$/, '')
      .trim();
    map.set(key, value || 'unspecified');
  }
  if (map.size === 0) return undefined;
  return Object.fromEntries(Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)));
}

function formatPermissions(permissions) {
  if (!permissions) return '—';
  if (typeof permissions === 'string') {
    return permissions || '—';
  }
  return Object.entries(permissions)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
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
    const rawPermissions = tryParsePermissions(content);
    const permissions = formatPermissions(rawPermissions);
    const relativePath = path.posix.join('.github', 'workflows', file);
    const gitMeta = getGitMetadata(relativePath);

    rows.push({
      name,
      owner,
      triggers,
      permissions,
      relativePath,
      gitMeta,
      file: file,
      triggersList: rawTriggers ?? [],
      permissionsRaw: rawPermissions,
    });
  }

  const bodyLines = rows.map(({ name, owner, permissions, triggers, relativePath, gitMeta }) => {
      const link = `[${name}](../../${relativePath})`;
      return `| ${link} | \`${relativePath}\` | ${owner} | ${permissions} | ${triggers} | ${gitMeta} |`;
    });

  const markdown = `${HEADER}${bodyLines.join('\n')}\n${ROUTER_POLICY}`;

  if (!dryRun) {
    await fs.writeFile(outputPath, markdown, 'utf8');
  }

  return { rows, markdown, outputPath };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    outputArg: null,
    dryRun: false,
    check: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output' || arg === '-o') {
      options.outputArg = argv[index + 1] ?? null;
      if (options.outputArg !== null) {
        index += 1;
      }
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--check') {
      options.check = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/automation/generate-workflow-inventory.mjs [options]

Options:
  --output <path>, -o   Specify output path (default: docs/automation/WORKFLOWS.md)
  --dry-run             Generate inventory without writing to disk; prints Markdown to stdout
  --check               Verify the inventory file is up to date; exits non-zero on drift
  --help, -h            Show this help message
`);
}

async function main() {
  try {
    const { outputArg, dryRun, check, help } = parseArgs();

    if (help) {
      printUsage();
      return;
    }

    let outputPath = DEFAULT_OUTPUT_PATH;
    if (outputArg) {
      outputPath = path.isAbsolute(outputArg)
        ? outputArg
        : path.resolve(repoRoot, outputArg);
    }

    if (check) {
      const { markdown } = await generateWorkflowInventory({ outputPath, dryRun: true });
      let existing;
      try {
        existing = await fs.readFile(outputPath, 'utf8');
      } catch (error) {
        console.error(`Inventory file not found at ${outputPath}. Run \`npm run workflows:inventory\`.`);
        process.exitCode = 1;
        return;
      }

      if (existing !== markdown) {
        console.error('Workflow inventory is outdated. Run `npm run workflows:inventory` and commit the changes.');
        process.exitCode = 1;
        return;
      }

      console.log('Workflow inventory is up to date.');
      return;
    }

    const { markdown } = await generateWorkflowInventory({ outputPath, dryRun });
    if (dryRun) {
      process.stdout.write(markdown);
    }
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
