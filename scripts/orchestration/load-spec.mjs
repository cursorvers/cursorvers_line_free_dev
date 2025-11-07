#!/usr/bin/env node
/**
 * Codex Spec Loader
 * Loads and validates codex.spec.yaml against JSON Schema
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

/**
 * Load codex.spec.yaml and validate against JSON Schema
 * @param {string} specPath - Path to codex.spec.yaml (default: codex.spec.yaml)
 * @returns {Promise<Object>} Parsed and validated spec object
 */
export async function loadSpec(specPath = join(PROJECT_ROOT, 'codex.spec.yaml')) {
  // Load YAML file
  const yamlContent = fs.readFileSync(specPath, 'utf8');
  const spec = yaml.load(yamlContent);

  // Load JSON Schema
  const schemaPath = join(PROJECT_ROOT, 'schemas', 'codex-spec.schema.json');
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const schema = JSON.parse(schemaContent);

  // Validate against schema
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);
  const valid = validate(spec);

  if (!valid) {
    const errors = validate.errors.map(err => 
      `${err.instancePath || '/'}: ${err.message}`
    ).join('\n');
    throw new Error(`Spec validation failed:\n${errors}`);
  }

  return spec;
}

/**
 * Get event rules for a specific event type
 * @param {Object} spec - Parsed spec object
 * @param {string} eventType - Event type (e.g., 'line_follow', 'note_viewed')
 * @returns {Array} Array of rules for the event
 */
export function getEventRules(spec, eventType) {
  if (!spec.events || !spec.events[eventType]) {
    return [];
  }
  return spec.events[eventType].rules || [];
}

/**
 * Get constraint configuration
 * @param {Object} spec - Parsed spec object
 * @param {string} constraintType - Constraint type (e.g., 'phi_filter', 'verified_domain')
 * @returns {Object|null} Constraint configuration or null if not found
 */
export function getConstraint(spec, constraintType) {
  if (!spec.constraints || !spec.constraints[constraintType]) {
    return null;
  }
  return spec.constraints[constraintType];
}

/**
 * Get tag definition
 * @param {Object} spec - Parsed spec object
 * @param {string} tagName - Tag name
 * @returns {Object|null} Tag definition or null if not found
 */
export function getTagDefinition(spec, tagName) {
  if (!spec.tags || !spec.tags[tagName]) {
    return null;
  }
  return spec.tags[tagName];
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const specPath = process.argv[2] || join(PROJECT_ROOT, 'codex.spec.yaml');
  
  loadSpec(specPath)
    .then(spec => {
      console.log('✅ Spec loaded and validated successfully');
      console.log(`Version: ${spec.version}`);
      console.log(`Events: ${Object.keys(spec.events).length}`);
      console.log(`Constraints: ${Object.keys(spec.constraints).length}`);
      console.log(`Tags: ${Object.keys(spec.tags).length}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Failed to load spec:', error.message);
      process.exit(1);
    });
}

