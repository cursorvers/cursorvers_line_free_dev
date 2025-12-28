/**
 * Discord Bot バリデーションユーティリティ
 */

// Email validation is now centralized in _shared/validation-utils.ts
// Re-export for backwards compatibility
export { EMAIL_REGEX, isValidEmail } from "../_shared/validation-utils.ts";

/**
 * メールアドレスを正規化（トリム＋小文字化）
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
 * Discord メッセージを指定文字数で分割
 * Discord の 2000 文字制限に対応
 */
export function splitMessage(text: string, maxLength = 2000): string[] {
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
 * HEX文字列をUint8Arrayに変換（署名検証用）
 */
export function hexToUint8Array(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) {
    throw new Error("Invalid hex string");
  }
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

/**
 * Discord Interactionのタイプ定数
 */
export const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

/**
 * Discord Interactionのレスポンスタイプ定数
 */
export const RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
} as const;
