import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractViewBoxDimensions,
  verifyColorTokens,
  readPngMetadata
} from '../../scripts/automation/build-line-assets.mjs';

test('extractViewBoxDimensions parses numeric values from viewBox', () => {
  const svg = '<svg viewBox="0 0 2500 843"></svg>';
  const dims = extractViewBoxDimensions(svg);
  assert.equal(dims.width, 2500);
  assert.equal(dims.height, 843);
});

test('verifyColorTokens throws when a color is missing', () => {
  const svg = '<svg><rect fill="#FFFFFF"/></svg>';
  assert.throws(() => verifyColorTokens(svg, ['#FFFFFF', '#0F1630']), /missing expected color tokens/i);
});

test('readPngMetadata returns width and height from IHDR chunk', () => {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPs6P8/AwAI/wNXN1IanwAAAABJRU5ErkJggg==';
  const buffer = Buffer.from(base64, 'base64');
  const meta = readPngMetadata(buffer);
  assert.equal(meta.width, 1);
  assert.equal(meta.height, 1);
});
