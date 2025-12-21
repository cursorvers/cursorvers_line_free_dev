/**
 * 認証コード生成・検証ユーティリティ
 * 有料会員のLINE紐付けに使用
 */

/** コード形式: 6桁英数字（大文字） */
const CODE_LENGTH = 6;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字(0,O,1,I)を除外

/** コード有効期限: 14日 */
export const CODE_EXPIRY_DAYS = 14;

/**
 * 認証コードを生成
 * - 6桁英数字（大文字）
 * - 紛らわしい文字(0,O,1,I)を除外
 * - 暗号論的に安全な乱数を使用
 */
export function generateVerificationCode(): string {
  const randomValues = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(randomValues);

  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[randomValues[i] % CODE_CHARS.length];
  }
  return code;
}

/**
 * 認証コードの有効期限を計算
 */
export function getCodeExpiryDate(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + CODE_EXPIRY_DAYS);
  return expiry;
}

/**
 * 認証コードとして誤認識しやすい予約語
 * - これらはLINE Botのコマンドや一般的な入力と衝突する可能性がある
 */
const RESERVED_WORDS = new Set([
  "CANCEL", // キャンセルコマンド
  "POLISH", // polishコマンドの誤入力
  "STATUS", // 一般的な入力
  "SUBMIT", // 一般的な入力
  "DELETE", // 一般的な入力
  "SIGNUP", // 一般的な入力
  "LOGOUT", // 一般的な入力
]);

/**
 * 入力が認証コード形式かどうかを判定
 * - 6桁英数字（大文字小文字不問）
 * - 予約語は除外
 */
export function isVerificationCodeFormat(input: string): boolean {
  // 6桁英数字（大文字小文字不問、スペース許容）
  const normalized = input.trim().toUpperCase();

  // 予約語チェック
  if (RESERVED_WORDS.has(normalized)) {
    return false;
  }

  return /^[A-Z0-9]{6}$/.test(normalized);
}

/**
 * 入力を正規化（大文字変換、トリム）
 */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * コードが有効期限内かどうかを判定
 */
export function isCodeExpired(expiresAt: Date | string): boolean {
  const expiry = typeof expiresAt === "string"
    ? new Date(expiresAt)
    : expiresAt;
  return new Date() > expiry;
}
