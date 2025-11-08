#!/usr/bin/env node
/**
 * Build LINE rich menu assets (PNG exports + metadata) from the canonical SVG.
 *
 * Features:
 *   • Converts SVG into 2x PNG variants (default + hover) when "sharp" is available.
 *   • Validates SVG color tokens so unintended palette drift is detected early.
 *   • Reads PNG headers directly to assert dimensions and emit a metadata manifest
 *     containing SHA-256 checksums for downstream verification.
 *
 * Usage:
 *   node scripts/automation/build-line-assets.mjs \
 *     --svg docs/design/line-richmenu/front-menu.svg \
 *     --out dist \
 *     [--scale 2] [--skip-render]
 *
 * When running inside CI where "sharp" might not be installed, pass --skip-render
 * (or set SKIP_LINE_ASSET_RENDER=1) to only validate existing PNG exports.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const DEFAULT_SVG = 'docs/design/line-richmenu/front-menu.svg';
const DEFAULT_OUTPUT_DIR = 'dist';
const DEFAULT_SCALE = 2;
const COLOR_TOKENS = [
  '#0F1630',
  '#050713',
  '#FF8DF9',
  '#C045FF',
  '#6FE6FF',
  '#3D68FF',
  '#A6FFE4',
  '#42C3FF',
  '#FFFFFF'
];

const VARIANTS = [
  {
    name: 'default',
    filename: 'front-menu.png',
    modulate: null
  },
  {
    name: 'hover',
    filename: 'front-menu-hover.png',
    modulate: {
      saturation: 0.75,
      brightness: 0.9
    }
  }
];

function printUsage() {
  console.log(`Usage:
  node scripts/automation/build-line-assets.mjs [--svg <path>] [--out <dir>] [--scale <num>] [--skip-render]

Options:
  --svg          Source SVG file (default: ${DEFAULT_SVG})
  --out          Output directory for PNG + metadata (default: ${DEFAULT_OUTPUT_DIR})
  --scale        Multiplier applied to SVG dimensions (default: ${DEFAULT_SCALE})
  --skip-render  Only validate existing PNGs (or set SKIP_LINE_ASSET_RENDER=1)
`);
}

function parseArgs(argv = []) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--svg') {
      args.svg = argv[++i];
    } else if (token === '--out') {
      args.out = argv[++i];
    } else if (token === '--scale') {
      args.scale = Number(argv[++i]);
    } else if (token === '--skip-render') {
      args.skipRender = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }
  return args;
}

export function extractViewBoxDimensions(svgContent) {
  const viewBoxMatch = svgContent.match(/viewBox="[^"]*?(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i);
  if (!viewBoxMatch) {
    throw new Error('SVG is missing a viewBox attribute, cannot determine dimensions.');
  }
  const [, , , widthRaw, heightRaw] = viewBoxMatch;
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Could not parse SVG width/height from viewBox.');
  }
  return { width, height };
}

export function verifyColorTokens(svgContent, expectedTokens = COLOR_TOKENS) {
  const missing = expectedTokens.filter((token) => !svgContent.toUpperCase().includes(token.toUpperCase()));
  if (missing.length > 0) {
    throw new Error(`SVG is missing expected color tokens: ${missing.join(', ')}`);
  }
}

export function readPngMetadata(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error('File is not a valid PNG (signature mismatch).');
  }
  const chunkType = buffer.subarray(12, 16).toString('ascii');
  if (chunkType !== 'IHDR') {
    throw new Error('PNG missing IHDR chunk.');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

async function ensureRenderer() {
  try {
    const sharpModule = await import('sharp');
    return sharpModule.default ?? sharpModule;
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

async function renderVariant(sharp, svgBuffer, { width, height }, targetPath, modulate) {
  let pipeline = sharp(svgBuffer, { density: 300 }).resize(width, height, { fit: 'fill' }).png({ compressionLevel: 9, adaptiveFiltering: false });
  if (modulate) {
    pipeline = pipeline.modulate({
      saturation: modulate.saturation ?? 1,
      brightness: modulate.brightness ?? 1
    });
  }
  await pipeline.toFile(targetPath);
  console.log(`✓ Rendered ${path.basename(targetPath)} (${width}x${height})`);
}

async function writeMetadata(entries, manifestPath) {
  const payload = {
    generatedAt: new Date().toISOString(),
    assets: entries
  };
  await fs.writeFile(manifestPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✓ Metadata written to ${manifestPath}`);
}

async function processAssets({ svgPath, outputDir, scale, skipRender }) {
  const svgAbsolute = path.resolve(svgPath);
  const outDirAbsolute = path.resolve(outputDir);
  await fs.mkdir(outDirAbsolute, { recursive: true });

  const svgContent = await fs.readFile(svgAbsolute, 'utf8');
  verifyColorTokens(svgContent);
  const baseDimensions = extractViewBoxDimensions(svgContent);
  const targetDimensions = {
    width: Math.round(baseDimensions.width * scale),
    height: Math.round(baseDimensions.height * scale)
  };

  const svgBuffer = Buffer.from(svgContent, 'utf8');
  const renderer = skipRender ? null : await ensureRenderer();
  if (!skipRender && !renderer) {
    throw new Error('Rendering requires the "sharp" dependency. Install it or rerun with --skip-render.');
  }

  const results = [];
  for (const variant of VARIANTS) {
    const targetPath = path.join(outDirAbsolute, variant.filename);
    if (!skipRender) {
      await renderVariant(renderer, svgBuffer, targetDimensions, targetPath, variant.modulate);
    } else {
      if (!(await fileExists(targetPath))) {
        console.warn(`⚠️ ${variant.filename} missing but rendering skipped. Create it before validation.`);
        continue;
      }
    }

    const pngBuffer = await fs.readFile(targetPath);
    const { width, height } = readPngMetadata(pngBuffer);
    if (width !== targetDimensions.width || height !== targetDimensions.height) {
      throw new Error(`PNG dimension mismatch for ${variant.filename}: expected ${targetDimensions.width}x${targetDimensions.height}, got ${width}x${height}`);
    }
    const checksum = crypto.createHash('sha256').update(pngBuffer).digest('hex');
    results.push({
      name: variant.name,
      file: path.relative(process.cwd(), targetPath),
      width,
      height,
      sha256: checksum
    });
  }

  const manifestPath = path.join(outDirAbsolute, 'front-menu.meta.json');
  await writeMetadata(results, manifestPath);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return;
  }

  const svgPath = args.svg ?? DEFAULT_SVG;
  const outputDir = args.out ?? DEFAULT_OUTPUT_DIR;
  const scale = Number.isFinite(args.scale) && args.scale > 0 ? args.scale : DEFAULT_SCALE;
  const skipRender = Boolean(args.skipRender || process.env.SKIP_LINE_ASSET_RENDER);

  await processAssets({
    svgPath,
    outputDir,
    scale,
    skipRender
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
