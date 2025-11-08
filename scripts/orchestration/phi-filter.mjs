#!/usr/bin/env node
/**
 * PHI (Protected Health Information) filter utilities.
 * Designed to evaluate incoming LINE/note payloads for sensitive data
 * based on regex patterns defined in the orchestration spec.
 */

/**
 * Evaluate text segments against configured PHI patterns.
 *
 * @param {Object} constraint - Spec constraint configuration.
 * @param {string[]} segments - Text snippets to evaluate.
 * @returns {{blocked: boolean, matches: Array<{type: string, pattern: string, sample: string}>, action: string}}
 */
export function evaluatePhiFilter(constraint, segments) {
  if (!constraint || constraint.enabled === false) {
    return { blocked: false, matches: [], action: constraint?.action_on_detect ?? 'flag' };
  }

  const patterns = Array.isArray(constraint.patterns) ? constraint.patterns : [];
  if (patterns.length === 0) {
    return { blocked: false, matches: [], action: constraint.action_on_detect ?? 'flag' };
  }

  const normalizedSegments = Array.isArray(segments)
    ? segments.filter((value) => typeof value === 'string' && value.trim().length > 0)
    : [];

  if (normalizedSegments.length === 0) {
    return { blocked: false, matches: [], action: constraint.action_on_detect ?? 'flag' };
  }

  const matches = [];
  for (const patternDef of patterns) {
    const regex = buildRegex(patternDef?.regex);
    if (!regex) {
      continue;
    }
    for (const segment of normalizedSegments) {
      const result = segment.match(regex);
      if (result) {
        matches.push({
          type: patternDef.type ?? 'unknown',
          pattern: patternDef.regex,
          sample: result[0]
        });
      }
    }
  }

  const action = constraint.action_on_detect ?? 'flag';
  return {
    blocked: matches.length > 0 && action !== 'log_only',
    matches,
    action
  };
}

/**
 * Collect candidate text segments from an evaluation context.
 *
 * @param {Object} context - Rule evaluation context.
 * @returns {string[]} Collection of text snippets for PHI scanning.
 */
export function collectPhiSegments(context = {}) {
  const segments = new Set();

  const payload = context.payload ?? {};
  const meta = context.meta ?? {};

  addIfString(segments, payload.text);
  addIfString(segments, payload.rawText);
  addIfString(segments, payload.command);

  if (typeof payload.message === 'object' && payload.message) {
    addIfString(segments, payload.message.text);
  }

  if (Array.isArray(payload.messages)) {
    for (const entry of payload.messages) {
      if (typeof entry === 'string') {
        addIfString(segments, entry);
      } else if (entry && typeof entry.text === 'string') {
        addIfString(segments, entry.text);
      }
    }
  }

  if (Array.isArray(meta.textSegments)) {
    for (const entry of meta.textSegments) {
      addIfString(segments, entry);
    }
  }

  return Array.from(segments);
}

function addIfString(collection, value) {
  if (typeof value === 'string' && value.trim().length > 0) {
    collection.add(value);
  }
}

function buildRegex(pattern) {
  if (typeof pattern !== 'string' || pattern.trim().length === 0) {
    return null;
  }
  try {
    return new RegExp(pattern, 'iu');
  } catch {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exampleConstraint = {
    enabled: true,
    action_on_detect: 'remove_and_warn',
    patterns: [
      { type: 'email', regex: '[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}' },
      { type: 'phone', regex: '0\\d{1,4}-\\d{1,4}-\\d{4}' }
    ]
  };
  const segments = collectPhiSegments({ payload: { text: '連絡先 test@example.com です' } });
  const result = evaluatePhiFilter(exampleConstraint, segments);
  console.log(JSON.stringify(result, null, 2));
}
