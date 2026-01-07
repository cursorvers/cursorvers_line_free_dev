/**
 * Discord Bot バリデーションユーティリティ
 */

// Email validation is now centralized in _shared/validation-utils.ts
// Re-export for backwards compatibility
export { EMAIL_REGEX, isValidEmail } from "../_shared/validation-utils.ts";

// splitMessage と hexToUint8Array は _shared/utils.ts に統合
// Re-export for backwards compatibility
export { hexToUint8Array, splitMessage } from "../_shared/utils.ts";

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
