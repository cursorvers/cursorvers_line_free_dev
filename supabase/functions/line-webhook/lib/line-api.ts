/**
 * LINE Messaging API ヘルパー
 */
import { extractErrorMessage } from "../../_shared/error-utils.ts";
import { anonymizeUserId, createLogger } from "../../_shared/logger.ts";
import { withSafetyFooter } from "../../_shared/safety.ts";

const log = createLogger("line-api");

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ??
  "";
const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";

/** クイックリプライアイテムの型 */
export interface QuickReplyItem {
  type: "action";
  action: {
    type: "message" | "postback";
    label: string;
    text?: string;
    data?: string;
    displayText?: string;
  };
}

/** クイックリプライ */
export interface QuickReply {
  items: QuickReplyItem[];
}

/**
 * LINE 署名検証
 */
export async function verifyLineSignature(
  req: Request,
  rawBody: string,
): Promise<boolean> {
  if (!LINE_CHANNEL_SECRET) return false;
  const signature = req.headers.get("x-line-signature");
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(LINE_CHANNEL_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const hmac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hashArray = Array.from(new Uint8Array(hmac));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));

  return hashBase64 === signature;
}

/**
 * LINE 返信（reply API）
 */
export async function replyText(
  replyToken: string,
  text: string,
  quickReply?: QuickReply,
): Promise<boolean> {
  if (!replyToken) {
    log.warn("replyText: No replyToken provided");
    return false;
  }
  const message: Record<string, unknown> = {
    type: "text",
    text: withSafetyFooter(text),
  };
  if (quickReply) {
    message.quickReply = quickReply;
  }
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [message],
    }),
  });
  if (!res.ok) {
    const errorBody = await res.text();
    log.error("replyText failed", { status: res.status, errorBody });
    return false;
  }
  return true;
}

/**
 * LINE push（非同期で結果を送る用）
 */
export async function pushText(
  lineUserId: string,
  text: string,
): Promise<boolean> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text }],
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      log.error("pushText failed", {
        userId: anonymizeUserId(lineUserId),
        status: res.status,
        errorBody,
      });
      return false;
    }
    return true;
  } catch (err) {
    log.error("pushText exception", {
      userId: anonymizeUserId(lineUserId),
      errorMessage: extractErrorMessage(err),
    });
    return false;
  }
}

/**
 * LINE push with Quick Reply
 */
export async function pushWithQuickReply(
  lineUserId: string,
  text: string,
  quickReply: QuickReply,
): Promise<void> {
  const message: Record<string, unknown> = {
    type: "text",
    text: text,
    quickReply: quickReply,
  };

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [message],
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    log.error("pushWithQuickReply failed", {
      userId: anonymizeUserId(lineUserId),
      status: res.status,
      errorBody,
    });
  }
}

/**
 * Reply with message object directly (for custom formatting)
 */
export async function replyRaw(
  replyToken: string,
  message: Record<string, unknown>,
): Promise<Response> {
  return await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [message],
    }),
  });
}
