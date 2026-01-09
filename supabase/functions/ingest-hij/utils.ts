/**
 * ingest-hij ユーティリティ関数
 */

/**
 * TLP（Traffic Light Protocol）抽出関数
 * TLP:GREEN, TLP:AMBER, TLP:RED, TLP:CLEAR をマッチ
 */
export function extractTLP(text: string): string | null {
  const match = text.match(/TLP:\s*(GREEN|AMBER|RED|CLEAR)/i);
  const value = match?.[1];
  return value ? value.toUpperCase() : null;
}

/**
 * 入力ペイロードの型定義
 */
export interface IngestPayload {
  message_id: string;
  sent_at: string;
  subject: string;
  body: string;
}

/**
 * ペイロードバリデーション
 */
export function validatePayload(
  payload: Partial<IngestPayload>,
): { valid: boolean; error?: string } {
  if (!payload.message_id) {
    return { valid: false, error: "message_id is required" };
  }
  if (!payload.sent_at) {
    return { valid: false, error: "sent_at is required" };
  }
  if (!payload.body) {
    return { valid: false, error: "body is required" };
  }
  return { valid: true };
}
