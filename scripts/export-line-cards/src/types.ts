/**
 * LINE Cards Export Script - Type Definitions
 */

/** Card theme categories */
export type CardTheme =
  | "ai_gov"   // 医療AIガバナンス
  | "tax"      // 税務・資産形成
  | "law"      // 法務・契約
  | "biz"      // Cursorvers事業戦略
  | "career"   // 医師キャリア・働き方
  | "asset"    // 個人の資産形成
  | "general"; // その他

/** Card status in database */
export type CardStatus = "ready" | "used" | "archived";

/** Theme tag mapping */
export const THEME_TAG_MAP: Record<string, CardTheme> = {
  "#ai_gov": "ai_gov",
  "#tax": "tax",
  "#law": "law",
  "#biz": "biz",
  "#career": "career",
  "#asset": "asset",
};

/** Main extraction tag */
export const EXTRACTION_TAG = "#cv_line";

/** Extracted card from Obsidian */
export interface ExtractedCard {
  /** Card body text (tags removed) */
  body: string;
  /** Theme classification */
  theme: CardTheme;
  /** Source file path relative to vault */
  sourcePath: string;
  /** Source line number */
  sourceLine: number;
  /** Content hash for deduplication */
  contentHash: string;
}

/** Card record for database insertion */
export interface LineCardInsert {
  body: string;
  theme: CardTheme;
  source_path: string;
  source_line: number;
  content_hash: string;
  status: CardStatus;
  times_used: number;
  created_from_vault_at: string;
}

/** Existing card record from database */
export interface LineCardRecord extends LineCardInsert {
  id: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Extraction result for a single file */
export interface FileExtractionResult {
  filePath: string;
  cards: ExtractedCard[];
  errors: string[];
}

/** Overall extraction statistics */
export interface ExtractionStats {
  filesScanned: number;
  filesWithCards: number;
  totalCardsFound: number;
  newCardsInserted: number;
  duplicatesSkipped: number;
  errors: string[];
}

/** Script configuration */
export interface ExportConfig {
  vaultPath: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  dryRun: boolean;
  batchSize: number;
}
