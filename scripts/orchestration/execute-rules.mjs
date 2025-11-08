#!/usr/bin/env node
import { loadSpec } from './load-spec.mjs';
import { collectPhiSegments, evaluatePhiFilter } from './phi-filter.mjs';
import { evaluateVerifiedDomain } from './verified-links.mjs';

export function createRuleEngine(spec) {
  const normalized = normalizeSpec(spec);
  return {
    globals: normalized.globals,
    constraints: normalized.constraints,
    evaluate(input) {
      return evaluateRules(normalized, input);
    }
  };
}

export async function loadRuleEngine(filePath) {
  const spec = await loadSpec(filePath);
  return createRuleEngine(spec);
}

function normalizeSpec(spec) {
  const events = new Set();
  const rules = [];

  if (Array.isArray(spec.events)) {
    spec.events.forEach((event) => {
      if (typeof event === 'string') {
        events.add(event);
      }
    });
    const rawRules = Array.isArray(spec.rules) ? spec.rules : [];
    rawRules.forEach((rule) => {
      rules.push(normalizeRule(rule));
    });
  } else if (spec.events && typeof spec.events === 'object') {
    for (const [eventName, config] of Object.entries(spec.events)) {
      if (typeof eventName === 'string') {
        events.add(eventName);
      }
      const eventRules = Array.isArray(config?.rules) ? config.rules : [];
      eventRules.forEach((rule) => {
        rules.push(normalizeRule({
          id: rule.id,
          when: `event == '${eventName}'`,
          if: rule.condition,
          do: rule.actions?.map(convertActionFromLegacy) ?? [],
          limits: rule.limits,
          constraints: rule.constraints
        }));
      });
    }
  }

  return {
    events,
    rules: rules.filter((rule) => rule.event),
    globals: spec.globals || {},
    constraints: spec.constraints || {}
  };
}

function convertActionFromLegacy(action) {
  if (!action || typeof action !== 'object') {
    return action;
  }
  switch (action.type) {
    case 'set_tag':
      return { tag: { add: [action.tag].filter(Boolean) } };
    case 'update_tag':
      return { tag: { add: [action.tag].filter(Boolean) } };
    case 'send_message':
      return { send_message: { template: action.template } };
    case 'process_message':
      return { action: { process_message: { handler: action.handler } } };
    default:
      return action;
  }
}

function extractEvent(expression) {
  if (typeof expression !== 'string') {
    return null;
  }
  const match = expression.match(/event\s*==\s*['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

function buildCondition(expression) {
  if (!expression) {
    return () => true;
  }
  return (context) => {
    const tokens = expression
      .split(/\s+and\s+/i)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    return tokens.every((token) => evaluateToken(token, context));
  };
}

function evaluateToken(token, context) {
  const trimmed = token.startsWith('not ') ? token.slice(4).trim() : token;
  const negate = token.startsWith('not ');
  const result = evaluatePositiveToken(trimmed, context);
  return negate ? !result : result;
}

function evaluatePositiveToken(token, context) {
  const tags = new Set(context.user?.tags || []);
  const contains = token.match(/user\.tags\.contains\(['"]([^'"]+)['"]\)/);
  if (contains) {
    return tags.has(contains[1]);
  }
  throw new Error(`Unsupported condition token: ${token}`);
}

function normalizeActions(actions) {
  return actions.map((entry) => {
    if ('send_message' in entry) {
      return { type: 'send_message', payload: entry.send_message };
    }
    if ('tag' in entry) {
      return { type: 'tag', payload: entry.tag };
    }
    if ('metric' in entry) {
      return { type: 'metric', payload: entry.metric.emit ?? entry.metric };
    }
    if ('action' in entry) {
      const value = entry.action;
      if (typeof value === 'string') {
        return { type: 'action', name: value, parameters: {} };
      }
      const [name, parameters] = Object.entries(value)[0] || [];
      return { type: 'action', name, parameters: parameters ?? {} };
    }
    return { type: 'unknown', payload: entry };
  });
}

function evaluateRules(normalized, input) {
  const eventName = input.event ?? input.type;
  if (!eventName || !normalized.events.has(eventName)) {
    return { triggered: [], globals: normalized.globals, constraints: normalized.constraints };
  }
  const context = {
    event: eventName,
    user: input.user ?? {},
    payload: input.payload ?? {},
    meta: input.meta ?? {}
  };

  const triggered = [];
  const violations = [];
  for (const rule of normalized.rules) {
    if (rule.event && rule.event !== eventName) {
      continue;
    }
    let conditionMet = true;
    try {
      conditionMet = rule.condition(context);
    } catch (error) {
      throw new Error(`Rule ${rule.id} condition error: ${error.message}`);
    }
    if (!conditionMet) {
      continue;
    }
    const constraintViolations = applyConstraints(rule, normalized, context);
    if (constraintViolations.length > 0) {
      violations.push({
        ruleId: rule.id,
        constraints: constraintViolations
      });
      continue;
    }
    triggered.push({
      ruleId: rule.id,
      limits: rule.limits,
      operations: rule.actions
    });
  }

  return { triggered, violations, globals: normalized.globals, constraints: normalized.constraints };
}

function normalizeRule(rule = {}) {
  return {
    id: rule.id,
    event: extractEvent(rule.when ?? rule.event),
    condition: buildCondition(rule.if ?? null),
    actions: normalizeActions(rule.do || []),
    limits: rule.limits || {},
    constraints: normalizeRuleConstraints(rule.constraints)
  };
}

function normalizeRuleConstraints(constraints) {
  if (!Array.isArray(constraints)) {
    return [];
  }
  return constraints
    .filter((entry) => entry && typeof entry.type === 'string')
    .map((entry) => ({
      type: entry.type,
      enabled: entry.enabled !== false,
      config: entry
    }));
}

function applyConstraints(rule, spec, context) {
  if (!Array.isArray(rule.constraints) || rule.constraints.length === 0) {
    return [];
  }
  const results = [];
  for (const constraint of rule.constraints) {
    if (constraint.enabled === false) {
      continue;
    }
    const definition = spec.constraints?.[constraint.type];
    if (!definition || definition.enabled === false) {
      continue;
    }
    const effectiveConfig = { ...definition, ...constraint.config };
    let evaluation = null;
    if (constraint.type === 'phi_filter') {
      const segments = collectPhiSegments(context);
      evaluation = evaluatePhiFilter(effectiveConfig, segments);
    } else if (constraint.type === 'verified_domain') {
      evaluation = evaluateVerifiedDomain(effectiveConfig, rule.actions, {
        globals: spec.globals,
        links: context.meta?.links
      });
    }
    if (evaluation && evaluation.blocked) {
      results.push({
        type: constraint.type,
        details: evaluation
      });
    }
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const engine = await loadRuleEngine(process.argv[2]);
      console.log(`Loaded spec with ${engine.globals ? 'globals' : 'no globals'}.`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  })();
}
