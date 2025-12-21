/**
 * LINE API ユーティリティ関数（テスト可能な純粋関数）
 */

import type { QuickReply, QuickReplyItem } from "./line-api.ts";

/**
 * メッセージアクションのQuickReplyアイテムを作成
 */
export function createMessageAction(
  label: string,
  text: string,
): QuickReplyItem {
  return {
    type: "action",
    action: {
      type: "message",
      label: label.length > 20 ? label.slice(0, 17) + "..." : label,
      text,
    },
  };
}

/**
 * ポストバックアクションのQuickReplyアイテムを作成
 */
export function createPostbackAction(
  label: string,
  data: string,
  displayText?: string,
): QuickReplyItem {
  return {
    type: "action",
    action: {
      type: "postback",
      label: label.length > 20 ? label.slice(0, 17) + "..." : label,
      data,
      displayText: displayText ?? label,
    },
  };
}

/**
 * QuickReplyオブジェクトを作成
 */
export function createQuickReply(items: QuickReplyItem[]): QuickReply {
  return { items };
}

/**
 * メッセージをLINEの制限（5000文字）に合わせて切り詰める
 */
export function truncateMessage(
  text: string,
  maxLength: number = 5000,
): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 20) + "\n\n...（続きあり）";
}

/**
 * ラベルをLINEのQuickReply制限（20文字）に合わせて切り詰める
 */
export function truncateLabel(label: string, maxLength: number = 20): string {
  if (label.length <= maxLength) {
    return label;
  }
  return label.slice(0, maxLength - 3) + "...";
}

/**
 * LINE User IDのフォーマットを検証
 */
export function isValidLineUserId(userId: string): boolean {
  if (!userId || typeof userId !== "string") {
    return false;
  }
  // LINE User ID format: U followed by 32 hex characters
  return /^U[a-f0-9]{32}$/i.test(userId);
}

/**
 * 配列をQuickReplyアイテム数の上限（13個）に合わせる
 */
export function limitQuickReplyItems<T>(
  items: T[],
  maxItems: number = 13,
): T[] {
  return items.slice(0, maxItems);
}
