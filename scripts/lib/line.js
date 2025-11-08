/**
 * LINE Messaging API utilities
 * Template placeholder resolution and message formatting
 */

/**
 * Recursively resolve template placeholders in an object or array
 * @param {any} obj - Object, array, or primitive value to process
 * @returns {any} - Object with placeholders replaced
 */
function resolvePlaceholdersRecursive(obj) {
  if (typeof obj === 'string') {
    return resolveStringPlaceholders(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => resolvePlaceholdersRecursive(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolvePlaceholdersRecursive(value);
    }
    return resolved;
  }
  return obj;
}

/**
 * Resolve template placeholders in a string
 * Supports {{VAR_NAME}} format
 * @param {string} str - String with placeholders
 * @returns {string} - String with placeholders replaced
 */
function resolveStringPlaceholders(str) {
  if (typeof str !== 'string') {
    return str;
  }
  
  return str.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = process.env[varName];
    if (value === undefined) {
      console.warn(`⚠️ Environment variable ${varName} not found. Keeping placeholder.`);
      return match;
    }
    return value;
  });
}

/**
 * Apply template placeholders to a message object or array of messages
 * @param {Object|Array} messages - Single message object or array of messages
 * @returns {Object|Array} - Messages with placeholders resolved
 */
export function applyTemplatePlaceholders(messages) {
  if (Array.isArray(messages)) {
    return messages.map(msg => resolvePlaceholdersRecursive(msg));
  }
  return resolvePlaceholdersRecursive(messages);
}
