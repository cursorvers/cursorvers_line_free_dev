/**
 * discord-bot ユーティリティ関数
 */

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/**
 * HEX文字列をUint8Arrayに変換
 */
export function hexToUint8Array(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) {
    throw new Error("Invalid hex string");
  }
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

/**
 * メッセージを指定文字数で分割
 */
export function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // 改行位置で分割を試みる
    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // 改行が見つからない場合はスペースで分割
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // それでも見つからない場合は強制分割
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

/**
 * メールアドレスを正規化（trim + lowercase）
 */
export function normalizeEmail(email: unknown): string {
  if (typeof email === "string") {
    return email.trim().toLowerCase();
  }
  if (typeof email === "number") {
    return String(email).trim().toLowerCase();
  }
  return "";
}

/**
 * メールアドレスのバリデーション
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}
