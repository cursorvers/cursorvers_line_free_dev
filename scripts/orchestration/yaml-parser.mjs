#!/usr/bin/env node
/**
 * Minimal YAML parser tailored for codex.spec.yaml.
 * Supports the subset of YAML used in this repository:
 * - Object mappings using `key: value`
 * - Nested objects via indentation (2 spaces)
 * - Arrays declared with `- value` or `- key: value`
 * - Strings (quoted or bare), numbers, booleans, and null
 */

import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

export function parseYaml(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const root = {};
  const stack = [{ indent: -1, container: root }];

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmedLine = rawLine.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const indent = countIndent(rawLine);
    if (indent % 2 !== 0) {
      throw new Error(`Invalid indentation (must be multiples of 2 spaces) on line ${i + 1}`);
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].container;
    if (trimmedLine.startsWith('- ')) {
      if (!Array.isArray(parent)) {
        throw new Error(`List item without parent array on line ${i + 1}`);
      }
      const itemContent = trimmedLine.slice(2).trim();
      handleListItem({
        itemContent,
        indent,
        lines,
        lineIndex: i,
        parent,
        stack,
      });
      continue;
    }

    const { key, valuePart } = splitKeyValue(trimmedLine, i);
    const next = peekNextMeaningfulLine(lines, i);
    const expectArray = valuePart === '' && next && next.indent > indent && next.trimmed.startsWith('- ');
    const value = parseScalar(valuePart, expectArray);

    if (Array.isArray(parent)) {
      throw new Error(`Unexpected object property within array on line ${i + 1}`);
    }

    parent[key] = value;
    if (isContainer(value)) {
      stack.push({ indent, container: value });
    }
  }

  return root;
}

function handleListItem({ itemContent, indent, lines, lineIndex, parent, stack }) {
  if (itemContent === '') {
    const entry = {};
    parent.push(entry);
    stack.push({ indent, container: entry });
    return;
  }

  const kvMatch = itemContent.match(/^([^:]+):(.*)$/);
  if (kvMatch) {
    const key = kvMatch[1].trim();
    const rest = kvMatch[2].trim();
    const next = peekNextMeaningfulLine(lines, lineIndex);
    const expectArray = rest === '' && next && next.indent > indent && next.trimmed.startsWith('- ');

    const entry = {};
    const value = parseScalar(rest, expectArray);
    entry[key] = value;
    parent.push(entry);
    stack.push({ indent, container: entry });
    if (isContainer(value)) {
      stack.push({ indent: indent + 2, container: value });
    }
    return;
  }

  const value = parseScalar(itemContent, false);
  parent.push(value);
  if (isContainer(value)) {
    stack.push({ indent, container: value });
  }
}

function parseScalar(rawValue, expectArray) {
  if (rawValue === undefined || rawValue === '') {
    return expectArray ? [] : {};
  }
  const value = rawValue.trim();
  if (!value) {
    return expectArray ? [] : {};
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const inner = value.slice(1, -1);
    if (value.startsWith('"')) {
      return unescapeYamlString(inner);
    }
    return inner.replace(/''/g, "'");
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}

function countIndent(line) {
  let count = 0;
  while (count < line.length && line[count] === ' ') {
    count += 1;
  }
  return count;
}

function splitKeyValue(line, lineIndex) {
  const match = line.match(/^([^:]+):(.*)$/);
  if (!match) {
    throw new Error(`Invalid YAML syntax on line ${lineIndex + 1}: "${line}"`);
  }
  return {
    key: match[1].trim(),
    valuePart: match[2].trim(),
  };
}

function peekNextMeaningfulLine(lines, startIndex) {
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    return {
      indent: countIndent(rawLine),
      trimmed,
    };
  }
  return null;
}

function isContainer(value) {
  return value !== null && typeof value === 'object';
}

function unescapeYamlString(value) {
  let result = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '\\' && i + 1 < value.length) {
      const next = value[i + 1];
      switch (next) {
        case '\\':
          result += '\\';
          break;
        case '"':
          result += '"';
          break;
        case 'n':
          result += '\n';
          break;
        case 'r':
          result += '\r';
          break;
        case 't':
          result += '\t';
          break;
        default:
          result += next;
          break;
      }
      i += 1;
    } else {
      result += ch;
    }
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: yaml-parser.mjs <file>');
    process.exit(1);
  }
  const target = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(target)) {
    console.error(`File not found: ${target}`);
    process.exit(1);
  }
  const content = fs.readFileSync(target, 'utf8');
  const parsed = parseYaml(content);
  console.log(JSON.stringify(parsed, null, 2));
}
