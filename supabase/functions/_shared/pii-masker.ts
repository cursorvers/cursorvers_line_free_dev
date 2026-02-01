/**
 * PIIマスキングユーティリティ
 * Grok送信前に個人情報を自動マスキング
 */

/**
 * テキスト内の個人情報（PII）をマスキング
 * @param text - マスキング対象のテキスト
 * @returns マスキング済みテキスト
 */
export function maskPII(text: string): string {
  if (!text) return text;

  let masked = text;

  // メールアドレスのマスキング
  // パターン: xxx@xxx.xxx 形式（単語境界で区切る）
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  masked = masked.replace(emailPattern, "[EMAIL_MASKED]");

  // 電話番号のマスキング（日本形式）
  // パターン1: 090-1234-5678, 03-1234-5678 など（ハイフン区切り）
  const phonePatternHyphen = /\b0\d{1,4}-\d{1,4}-\d{4}\b/g;
  masked = masked.replace(phonePatternHyphen, "[PHONE_MASKED]");

  // パターン2: 09012345678 など（ハイフンなし）
  const phonePatternNoHyphen = /\b0\d{9,10}\b/g;
  masked = masked.replace(phonePatternNoHyphen, "[PHONE_MASKED]");

  // クレジットカード番号のマスキング
  // パターン: 1234-5678-9012-3456 形式（4桁-4桁-4桁-4桁）
  const creditCardPattern = /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g;
  masked = masked.replace(creditCardPattern, "[CC_MASKED]");

  return masked;
}
