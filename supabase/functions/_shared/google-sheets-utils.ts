/**
 * Google Sheets ユーティリティ（テスト可能な純粋関数）
 */

/**
 * PEM形式の秘密鍵からヘッダー/フッターを削除してBase64デコード
 */
export function cleanPemString(pem: string): string {
  return pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
}

/**
 * Base64文字列をデコード
 */
export function base64Decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}

/**
 * Uint8ArrayをBase64文字列にエンコード
 */
export function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * スプレッドシートIDが有効かどうかをチェック
 */
export function isValidSpreadsheetId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  // Google Spreadsheet IDは通常44文字のBase64-like文字列
  return /^[a-zA-Z0-9_-]{20,50}$/.test(id);
}

/**
 * タブ名を安全な形式に変換（特殊文字を除去）
 */
export function sanitizeTabName(name: string): string {
  if (!name) return "";
  // シート名に使用できない文字を除去: [ ] * ? / \ '
  return name.replace(/[\[\]*?\/\\']/g, "_").slice(0, 100);
}

/**
 * セル範囲の文字列を生成
 */
export function buildCellRange(
  tabName: string,
  startCol: string,
  startRow: number,
  endCol?: string,
  endRow?: number,
): string {
  const sanitized = sanitizeTabName(tabName);
  if (endCol && endRow) {
    return `${sanitized}!${startCol}${startRow}:${endCol}${endRow}`;
  } else if (endCol) {
    return `${sanitized}!${startCol}${startRow}:${endCol}`;
  }
  return `${sanitized}!${startCol}${startRow}`;
}

/**
 * A1記法のカラム文字を数字に変換
 */
export function columnToNumber(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + (col.charCodeAt(i) - 64);
  }
  return result;
}

/**
 * 数字をA1記法のカラム文字に変換
 */
export function numberToColumn(num: number): string {
  let result = "";
  while (num > 0) {
    const rem = (num - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result;
}
