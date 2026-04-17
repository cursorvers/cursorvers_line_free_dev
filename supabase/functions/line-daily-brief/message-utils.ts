/**
 * LINE Daily Brief メッセージフォーマットユーティリティ
 */

export type CardTheme =
  | "ai_gov"
  | "tax"
  | "law"
  | "biz"
  | "career"
  | "asset"
  | "general";

export interface LineCard {
  id: string;
  body: string;
  theme: CardTheme;
  source_path: string;
  times_used: number;
  status: "ready" | "used" | "archived";
}

/**
 * テーマごとの絵文字マッピング
 */
export const THEME_EMOJI: Record<CardTheme, string> = {
  ai_gov: "🤖",
  tax: "💰",
  law: "⚖️",
  biz: "📈",
  career: "👨‍⚕️",
  asset: "🏦",
  general: "💡",
};

/**
 * メッセージフッター
 */
export const MESSAGE_FOOTER =
  "\n\n──────────\nCursorvers.edu\nhttps://cursorvers.github.io/cursorvers-edu/";

/**
 * LINE メッセージの最大長
 */
export const MAX_MESSAGE_LENGTH = 4500;

/**
 * カードボディをLINEメッセージにフォーマット
 */
export function formatMessage(card: LineCard): string {
  const emoji = THEME_EMOJI[card.theme] || "💡";

  let message = `${emoji} 今日のひとこと\n\n${card.body}${MESSAGE_FOOTER}`;

  if (message.length > MAX_MESSAGE_LENGTH) {
    const truncatedBody = card.body.substring(
      0,
      MAX_MESSAGE_LENGTH - MESSAGE_FOOTER.length - 50,
    );
    message = `${emoji} 今日のひとこと\n\n${truncatedBody}...${MESSAGE_FOOTER}`;
  }

  return message;
}

/**
 * テーマの絵文字を取得
 */
export function getThemeEmoji(theme: CardTheme): string {
  return THEME_EMOJI[theme] || "💡";
}

/**
 * カードボディのプレビューを生成（指定文字数で切り詰め）
 */
export function generateBodyPreview(body: string, maxLength = 50): string {
  if (body.length <= maxLength) {
    return body;
  }
  return `${body.substring(0, maxLength)}...`;
}

/**
 * メッセージ長がLINE制限内かチェック
 */
export function isValidMessageLength(message: string): boolean {
  return message.length <= 5000; // LINE text message limit
}

export function isLineMonthlyLimitError(
  status: number | null | undefined,
  responseBody: string,
): boolean {
  return status === 429 && responseBody.toLowerCase().includes("monthly limit");
}

export function isLineDailyBriefHealthRequest(
  _method: string,
  url: URL,
  body: Record<string, unknown> | null | undefined,
): boolean {
  if (url.searchParams.get("mode") === "health") return true;
  return body?.["type"] === "health" || body?.["mode"] === "health";
}

export function getBroadcastFailureStatus(quotaExceeded?: boolean): {
  httpStatus: number;
  status: "quota_exceeded" | "broadcast_failed";
} {
  return quotaExceeded
    ? { httpStatus: 200, status: "quota_exceeded" }
    : { httpStatus: 500, status: "broadcast_failed" };
}
