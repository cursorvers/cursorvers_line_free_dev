/**
 * 共通バリデーションユーティリティ
 */

/**
 * メールアドレスバリデーション用正規表現
 * Note: 大文字小文字を区別しない (/i フラグ)
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/**
 * メールアドレスが有効かどうかをチェック
 * - 前後の空白はトリムされる
 * - 大文字小文字は区別しない
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * メールアドレスフォーマットチェック（isValidEmailのエイリアス）
 * @deprecated Use isValidEmail instead
 */
export const isValidEmailFormat = isValidEmail;

/**
 * URLが有効かどうかをチェック
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 日本語電話番号が有効かどうかをチェック
 */
export function isValidJapanesePhone(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;
  // ハイフン・スペースを除去
  const cleaned = phone.replace(/[-\s]/g, "");
  // 日本の電話番号パターン（固定電話、携帯）
  return /^0[0-9]{9,10}$/.test(cleaned);
}

/**
 * 文字列が空でないかどうかをチェック
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 正の整数かどうかをチェック
 */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0;
}

/**
 * 非負の整数かどうかをチェック
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0;
}

/**
 * 値が指定範囲内かどうかをチェック
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * 配列が空でないかどうかをチェック
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * UUIDが有効かどうかをチェック
 */
export function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== "string") return false;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * ISO 8601日付文字列が有効かどうかをチェック
 */
export function isValidISO8601(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime()) && dateStr.includes("T");
}

/**
 * JSON文字列が有効かどうかをチェック
 */
export function isValidJSON(str: string): boolean {
  if (!str || typeof str !== "string") return false;
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Base64文字列が有効かどうかをチェック
 */
export function isValidBase64(str: string): boolean {
  if (!str || typeof str !== "string") return false;
  // Base64 pattern: A-Za-z0-9+/=
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return base64Regex.test(str) && str.length % 4 === 0;
}
