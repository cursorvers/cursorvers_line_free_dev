/**
 * LINE Quick Reply ビルダー
 */
import { COURSE_KEYWORDS } from "./constants.ts";
import type { QuickReply, QuickReplyItem } from "./line-api.ts";

// Re-export types for convenience
export type { QuickReply, QuickReplyItem };

/**
 * 診断キーワード選択用のクイックリプライを生成
 */
export function buildDiagnosisQuickReply(): QuickReply {
  return {
    items: [
      // 診断キーワード
      ...COURSE_KEYWORDS.map((keyword) => ({
        type: "action" as const,
        action: {
          type: "message" as const,
          label: keyword.replace("診断", ""), // ラベルは短く
          text: keyword,
        },
      })),
      // お問い合わせボタン
      {
        type: "action" as const,
        action: {
          type: "message" as const,
          label: "お問い合わせ",
          text: "お問い合わせ",
        },
      },
    ],
  };
}

/**
 * サービス一覧用のクイックリプライを生成
 */
export function buildServicesQuickReply(): QuickReply {
  return {
    items: [
      {
        type: "action" as const,
        action: {
          type: "message" as const,
          label: "プロンプト整形",
          text: "プロンプト整形の使い方",
        },
      },
      {
        type: "action" as const,
        action: {
          type: "message" as const,
          label: "リスクチェック",
          text: "リスクチェックの使い方",
        },
      },
      {
        type: "action" as const,
        action: {
          type: "message" as const,
          label: "サービス詳細（Web）",
          text: "サービス詳細を見る",
        },
      },
    ],
  };
}

/**
 * 「戻る」ボタン付きクイックリプライ（ツールモード用）
 */
export function buildBackButtonQuickReply(): QuickReply {
  return {
    items: [
      {
        type: "action" as const,
        action: {
          type: "message" as const,
          label: "← 戻る",
          text: "戻る",
        },
      },
    ],
  };
}

/**
 * メルマガ同意確認用のクイックリプライを生成
 */
export function buildNewsletterConfirmQuickReply(): QuickReply {
  return {
    items: [
      {
        type: "action" as const,
        action: {
          type: "postback" as const,
          label: "OK",
          data: "email_opt_in=yes",
          displayText: "OK",
        },
      },
      {
        type: "action" as const,
        action: {
          type: "postback" as const,
          label: "配信しない",
          data: "email_opt_in=no",
          displayText: "配信しない",
        },
      },
    ],
  };
}
