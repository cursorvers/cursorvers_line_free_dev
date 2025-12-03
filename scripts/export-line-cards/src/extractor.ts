/**
 * Obsidian Vault Card Extractor
 * Extracts #cv_line tagged lines from markdown files
 */

import { walk } from "https://deno.land/std@0.210.0/fs/walk.ts";
import { crypto } from "https://deno.land/std@0.210.0/crypto/mod.ts";
import { relative, join } from "https://deno.land/std@0.210.0/path/mod.ts";
import {
  ExtractedCard,
  FileExtractionResult,
  CardTheme,
  THEME_TAG_MAP,
  EXTRACTION_TAG,
} from "./types.ts";

/**
 * Calculate SHA-256 hash for content deduplication
 */
async function calculateHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extract theme from a line containing tags
 */
function extractTheme(line: string): CardTheme {
  for (const [tag, theme] of Object.entries(THEME_TAG_MAP)) {
    if (line.includes(tag)) {
      return theme;
    }
  }
  return "general";
}

/**
 * Remove all tags from a line and clean up formatting
 */
function cleanCardBody(line: string): string {
  // Remove #cv_line and theme tags
  let cleaned = line
    .replace(/#cv_line/g, "")
    .replace(/#ai_gov/g, "")
    .replace(/#tax/g, "")
    .replace(/#law/g, "")
    .replace(/#biz/g, "")
    .replace(/#career/g, "")
    .replace(/#asset/g, "");

  // Remove bullet points and leading whitespace
  cleaned = cleaned.replace(/^[\s]*[-*+][\s]+/, "");

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * Get context lines (before/after) for a card
 */
function getContextLines(
  lines: string[],
  targetIndex: number,
  contextRange: number = 1
): string[] {
  const result: string[] = [];
  const targetIndent = getIndentLevel(lines[targetIndex]);

  // Check lines before
  for (let i = targetIndex - 1; i >= Math.max(0, targetIndex - contextRange); i--) {
    const line = lines[i];
    if (line.trim() === "") break; // Stop at empty line
    if (getIndentLevel(line) < targetIndent) break; // Stop if less indented (different context)
    
    // Only include if it's a continuation (same or deeper indent, same bullet structure)
    const lineIndent = getIndentLevel(line);
    if (lineIndent >= targetIndent && !line.includes(EXTRACTION_TAG)) {
      result.unshift(line);
    }
  }

  // Add target line
  result.push(lines[targetIndex]);

  // Check lines after
  for (
    let i = targetIndex + 1;
    i <= Math.min(lines.length - 1, targetIndex + contextRange);
    i++
  ) {
    const line = lines[i];
    if (line.trim() === "") break;
    if (getIndentLevel(line) <= targetIndent && !isContinuationLine(line)) break;
    
    // Only include continuation lines (deeper indent or clearly part of same item)
    if (!line.includes(EXTRACTION_TAG)) {
      result.push(line);
    }
  }

  return result;
}

/**
 * Get indentation level of a line
 */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * Check if line is a continuation (not a new bullet point)
 */
function isContinuationLine(line: string): boolean {
  const trimmed = line.trim();
  return !trimmed.match(/^[-*+]\s/) && trimmed.length > 0;
}

/**
 * Extract cards from a single markdown file
 */
export async function extractCardsFromFile(
  filePath: string,
  vaultPath: string
): Promise<FileExtractionResult> {
  const relativePath = relative(vaultPath, filePath);
  const cards: ExtractedCard[] = [];
  const errors: string[] = [];

  try {
    const content = await Deno.readTextFile(filePath);
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip if line doesn't contain our extraction tag
      if (!line.includes(EXTRACTION_TAG)) {
        continue;
      }

      try {
        // Extract theme from the line
        const theme = extractTheme(line);

        // Get context lines for richer content
        const contextLines = getContextLines(lines, i);

        // Clean and combine all context lines
        const bodyParts = contextLines.map(cleanCardBody).filter((s) => s.length > 0);
        const body = bodyParts.join(" ").trim();

        // Skip if body is too short
        if (body.length < 10) {
          errors.push(`Line ${i + 1}: Body too short after cleaning`);
          continue;
        }

        // Calculate hash for deduplication
        const hashInput = `${relativePath}:${i + 1}:${body}`;
        const contentHash = await calculateHash(hashInput);

        cards.push({
          body,
          theme,
          sourcePath: relativePath,
          sourceLine: i + 1,
          contentHash,
        });
      } catch (err) {
        errors.push(`Line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`File read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    filePath: relativePath,
    cards,
    errors,
  };
}

/**
 * Recursively scan vault and extract all cards
 */
export async function extractCardsFromVault(
  vaultPath: string
): Promise<{ cards: ExtractedCard[]; results: FileExtractionResult[] }> {
  const allCards: ExtractedCard[] = [];
  const results: FileExtractionResult[] = [];
  let processedFiles = 0;

  console.log(`📂 Scanning vault: ${vaultPath}`);

  for await (const entry of walk(vaultPath, {
    exts: [".md"],
    skip: [
      /node_modules/,
      /\.obsidian/,
      /\.git/,
      /\.trash/,
    ],
  })) {
    if (!entry.isFile) continue;

    const result = await extractCardsFromFile(entry.path, vaultPath);
    processedFiles += 1;

    if (result.cards.length > 0 || result.errors.length > 0) {
      results.push(result);
      allCards.push(...result.cards);
    }

    if (processedFiles % 10 === 0) {
      console.log(
        `   Progress: ${processedFiles} files scanned, ${allCards.length} cards collected, ${results.length} files with findings`
      );
    }
  }

  console.log(`✅ Scan complete: ${results.length} files processed, ${allCards.length} cards found`);

  return { cards: allCards, results };
}
