// scripts/export-line-cards/src/types.ts
// 型定義

/**
 * カードのテーマ分類
 */
export type LineCardTheme =
  | "ai_gov"   // 医療AIガバナンス
  | "tax"      // 税務・資産形成
  | "law"      // 法務・契約
  | "biz"      // Cursorvers事業戦略
  | "career"   // 医師キャリア・働き方
  | "asset"    // 個人の資産形成
  | "general"; // その他/未分類

/**
 * カードのステータス
 */
export type LineCardStatus = "ready" | "used" | "archived";

/**
 * 抽出されたカード（DBに保存前）
 */
export interface ExtractedCard {
  body: string;           // タグ削除済みの本文
  theme: LineCardTheme;   // テーマ分類
  sourcePath: string;     // Vault内のファイルパス（相対）
  sourceLine: number;     // 元になった行番号
  contentHash: string;    // 重複防止用ハッシュ
}

/**
 * DBに保存されたカード
 */
export interface LineCard extends ExtractedCard {
  id: string;
  status: LineCardStatus;
  timesUsed: number;
  lastUsedAt: string | null;
  createdFromVaultAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * パーサーの設定
 */
export interface ParserConfig {
  vaultPath: string;         // Obsidian Vaultのパス
  cardTag: string;           // カード抽出用タグ（例: #cv_line）
  includeContext: boolean;   // 前後の行を含めるか
  contextLines: number;      // 前後何行を含めるか
}

/**
 * 同期結果
 */
export interface SyncResult {
  totalFilesScanned: number;
  totalCardsFound: number;
  newCardsInserted: number;
  duplicatesSkipped: number;
  errors: string[];
}

/**
 * テーマタグのマッピング
 */
export const THEME_TAG_MAP: Record<string, LineCardTheme> = {
  "#ai_gov": "ai_gov",
  "#tax": "tax",
  "#law": "law",
  "#biz": "biz",
  "#career": "career",
  "#asset": "asset",
};

