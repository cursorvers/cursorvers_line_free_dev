// scripts/export-line-cards/src/parser.ts
// Obsidian Markdown ファイルからカードを抽出するパーサー

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import {
  ExtractedCard,
  LineCardTheme,
  ParserConfig,
  THEME_TAG_MAP,
} from "./types.js";

/**
 * デフォルトのパーサー設定
 */
export const DEFAULT_CONFIG: ParserConfig = {
  vaultPath: "/Users/masayuki/Obsidian Professional Kit",
  cardTag: "#cv_line",
  includeContext: true,
  contextLines: 1,
};

/**
 * ディレクトリを再帰的に走査して.mdファイルを取得
 */
export function getMarkdownFiles(dirPath: string): string[] {
  const files: string[] = [];

  function scanDir(currentPath: string): void {
    const entries = readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);

      // 隠しフォルダをスキップ（.obsidian, .git など）
      if (entry.name.startsWith(".")) {
        continue;
      }

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  scanDir(dirPath);
  return files;
}

/**
 * テキストからタグを抽出
 */
export function extractTags(text: string): string[] {
  const tagPattern = /#[\w_]+/g;
  return text.match(tagPattern) || [];
}

/**
 * タグからテーマを判定
 */
export function determineTheme(tags: string[]): LineCardTheme {
  for (const tag of tags) {
    const theme = THEME_TAG_MAP[tag.toLowerCase()];
    if (theme) {
      return theme;
    }
  }
  return "general";
}

/**
 * 行からタグを除去し、整形する
 */
export function cleanLineContent(line: string): string {
  // タグを削除
  let cleaned = line.replace(/#[\w_]+/g, "").trim();

  // 行頭の - や * などのリストマーカーを削除
  cleaned = cleaned.replace(/^[-*+]\s*/, "");

  // 先頭の番号付きリストを削除
  cleaned = cleaned.replace(/^\d+\.\s*/, "");

  // 余分な空白を整理
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * コンテンツハッシュを生成
 */
export function generateContentHash(
  sourcePath: string,
  sourceLine: number,
  body: string
): string {
  const content = `${sourcePath}:${sourceLine}:${body}`;
  return createHash("sha256").update(content).digest("hex").substring(0, 32);
}

/**
 * 前後のコンテキスト行を取得
 */
function getContextLines(
  lines: string[],
  targetIndex: number,
  contextCount: number
): string[] {
  const result: string[] = [];
  const targetIndent = getIndentLevel(lines[targetIndex]);

  // 前の行を取得（同じインデントレベルまたは子要素）
  for (let i = targetIndex - 1; i >= 0 && result.length < contextCount; i--) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) {
      break; // 空行やヘッダーで区切る
    }
    const indent = getIndentLevel(lines[i]);
    if (indent < targetIndent) {
      break; // 親要素に到達したら終了
    }
    result.unshift(cleanLineContent(lines[i]));
  }

  // ターゲット行を追加
  result.push(cleanLineContent(lines[targetIndex]));

  // 後の行を取得（同じインデントレベルまたは子要素）
  for (
    let i = targetIndex + 1;
    i < lines.length && result.length < contextCount * 2 + 1;
    i++
  ) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) {
      break;
    }
    const indent = getIndentLevel(lines[i]);
    if (indent < targetIndent) {
      break;
    }
    // #cv_line タグがある行は含めない（別カードになる）
    if (lines[i].includes("#cv_line")) {
      break;
    }
    result.push(cleanLineContent(lines[i]));
  }

  return result;
}

/**
 * 行のインデントレベルを取得
 */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * 単一のMarkdownファイルからカードを抽出
 */
export function extractCardsFromFile(
  filePath: string,
  vaultPath: string,
  config: ParserConfig
): ExtractedCard[] {
  const cards: ExtractedCard[] = [];

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (error) {
    console.error(`Failed to read file: ${filePath}`, error);
    return [];
  }

  const lines = content.split("\n");
  const relativePath = relative(vaultPath, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // #cv_line タグを含む行を探す
    if (!line.includes(config.cardTag)) {
      continue;
    }

    const tags = extractTags(line);
    const theme = determineTheme(tags);

    let bodyLines: string[];
    if (config.includeContext) {
      bodyLines = getContextLines(lines, i, config.contextLines);
    } else {
      bodyLines = [cleanLineContent(line)];
    }

    // 空のカードはスキップ
    const body = bodyLines.filter((l) => l.length > 0).join("\n");
    if (body.length === 0) {
      continue;
    }

    const contentHash = generateContentHash(relativePath, i + 1, body);

    cards.push({
      body,
      theme,
      sourcePath: relativePath,
      sourceLine: i + 1, // 1-indexed
      contentHash,
    });
  }

  return cards;
}

/**
 * Vault全体からカードを抽出
 */
export function extractAllCards(config: ParserConfig): ExtractedCard[] {
  const allCards: ExtractedCard[] = [];
  const files = getMarkdownFiles(config.vaultPath);

  console.log(`📂 Scanning ${files.length} markdown files...`);

  for (const file of files) {
    const cards = extractCardsFromFile(file, config.vaultPath, config);
    if (cards.length > 0) {
      console.log(`  ✓ ${relative(config.vaultPath, file)}: ${cards.length} cards`);
      allCards.push(...cards);
    }
  }

  console.log(`\n📝 Total cards extracted: ${allCards.length}`);
  return allCards;
}

