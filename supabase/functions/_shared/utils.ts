// supabase/functions/_shared/utils.ts
// 共有ユーティリティ関数

// ============================================
// 共通定数
// ============================================

/** Discord メッセージ制限 (2000文字) */
export const DISCORD_MESSAGE_LIMIT = 2000;

/** Discord メッセージ分割時の安全マージン (100文字余裕) */
export const DISCORD_SAFE_MESSAGE_LIMIT = 1900;

/** LINE テキストメッセージ制限 (5000文字) */
export const LINE_MESSAGE_LIMIT = 5000;

/** 月額料金 (円) */
export const MONTHLY_PRICE_YEN = 2980;

// ============================================
// ユーティリティ関数
// ============================================

/**
 * Discordの2000文字制限に対応するためのメッセージ分割
 * 改行 > スペース > 強制分割の順で分割点を探す
 */
export function splitMessage(
  text: string,
  maxLength = DISCORD_MESSAGE_LIMIT,
): string[] {
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
 * 16進数文字列をUint8Arrayに変換
 */
export function hexToUint8Array(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) {
    throw new Error("Invalid hex string");
  }
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}
