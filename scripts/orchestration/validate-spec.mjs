#!/usr/bin/env node
import path from 'node:path';
import { loadSpec } from './load-spec.mjs';

(async () => {
  try {
    await loadSpec(path.join(process.cwd(), 'codex.spec.yaml'));
    console.log('codex.spec.yaml ✓ valid');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
})();
