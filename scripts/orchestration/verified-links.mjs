#!/usr/bin/env node
/**
 * Verified domain helpers for outgoing delivery actions.
 */

const URL_PATTERN = /https?:\/\/[^\s)>\]}]+/giu;

/**
 * Evaluate outgoing operations against allowed domains.
 *
 * @param {Object} constraint - Spec constraint (global) definition.
 * @param {Array} operations - Normalized operations returned by the rule engine.
 * @param {Object} options - Additional context (globals, meta overrides).
 * @returns {{blocked: boolean, unverified: Array<{url: string, hostname: string}>, action: string}}
 */
export function evaluateVerifiedDomain(constraint, operations = [], options = {}) {
  if (!constraint || constraint.enabled === false) {
    return { blocked: false, unverified: [], action: constraint?.action_on_unverified ?? 'flag' };
  }

  const allowedDomains = buildAllowedDomainSet(constraint, options.globals, options.allowedDomains);
  if (allowedDomains.size === 0) {
    // Nothing to validate against; allow by default.
    return { blocked: false, unverified: [], action: constraint.action_on_unverified ?? 'flag' };
  }

  const links = collectLinks(operations, options);
  if (links.length === 0) {
    return { blocked: false, unverified: [], action: constraint.action_on_unverified ?? 'flag' };
  }

  const unverified = [];
  for (const url of links) {
    const hostname = extractHostname(url);
    if (!hostname) {
      continue;
    }
    if (!isAllowedHost(hostname, allowedDomains)) {
      unverified.push({ url, hostname });
    }
  }

  const action = constraint.action_on_unverified ?? 'reject';
  return {
    blocked: unverified.length > 0 && action !== 'log_only',
    unverified,
    action
  };
}

function buildAllowedDomainSet(constraint, globals = {}, overrides) {
  const domains = new Set();
  const sources = [
    constraint?.allowed_domains,
    constraint?.domains,
    overrides,
    globals?.verified_domains
  ];
  for (const source of sources) {
    if (!Array.isArray(source)) {
      continue;
    }
    for (const domain of source) {
      if (typeof domain === 'string' && domain.trim().length > 0) {
        domains.add(domain.trim().toLowerCase());
      }
    }
  }
  return domains;
}

function collectLinks(operations, options) {
  const results = new Set();

  if (Array.isArray(options.links)) {
    for (const link of options.links) {
      if (isConcreteLink(link)) {
        results.add(link);
      }
    }
  }

  for (const op of operations) {
    if (!op || typeof op !== 'object') {
      continue;
    }
    if (op.type === 'send_message') {
      const payload = op.payload ?? {};
      if (isConcreteLink(payload.link)) {
        results.add(payload.link);
      }
      if (typeof payload.body === 'string') {
        const matches = payload.body.match(URL_PATTERN);
        if (matches) {
          matches.forEach((url) => {
            if (isConcreteLink(url)) {
              results.add(url);
            }
          });
        }
      }
    } else if (op.type === 'action') {
      const params = op.parameters ?? {};
      if (isConcreteLink(params.link)) {
        results.add(params.link);
      }
      if (typeof params.url === 'string' && isConcreteLink(params.url)) {
        results.add(params.url);
      }
    }
  }

  return Array.from(results);
}

function isConcreteLink(url) {
  if (typeof url !== 'string') {
    return false;
  }
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return false;
  }
  // Skip template placeholders like {{ verified.note_page_url }}
  if (trimmed.includes('{{') && trimmed.includes('}}')) {
    return false;
  }
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

function extractHostname(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedHost(hostname, allowedDomains) {
  if (allowedDomains.has(hostname)) {
    return true;
  }
  for (const domain of allowedDomains) {
    if (hostname === domain) {
      return true;
    }
    if (hostname.endsWith(`.${domain}`)) {
      return true;
    }
  }
  return false;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const constraint = {
    enabled: true,
    allowed_domains: ['example.com', 'trusted.co.jp'],
    action_on_unverified: 'reject'
  };
  const operations = [
    { type: 'send_message', payload: { body: '詳細: https://example.com/info' } },
    { type: 'send_message', payload: { link: 'https://malicious.com' } }
  ];
  const result = evaluateVerifiedDomain(constraint, operations);
  console.log(JSON.stringify(result, null, 2));
}
