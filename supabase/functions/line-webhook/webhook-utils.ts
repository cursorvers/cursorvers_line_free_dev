/**
 * LINE Webhook ユーティリティ関数
 * index.ts から抽出したテスト可能なロジック
 */

import { COURSE_KEYWORDS, type DiagnosisKeyword } from "./lib/constants.ts";
import { isValidEmail } from "../_shared/validation-utils.ts";

/**
 * 入力長さをバケット化（匿名化用）
 */
export function bucketLength(len: number | null | undefined): string | null {
  if (len == null) return null;
  if (len <= 100) return "0-100";
  if (len <= 300) return "100-300";
  if (len <= 1000) return "300-1000";
  return "1000+";
}

/**
 * キーワードを正規化（全角スペース→半角、トリム）
 */
export function normalizeKeyword(raw: string): string {
  return raw.replace(/　/g, " ").trim();
}

/**
 * メールアドレス形式かどうかを判定
 * Note: Delegates to shared validation utils
 */
export function isEmailFormat(text: string): boolean {
  return isValidEmail(text);
}

/**
 * メールアドレスを正規化（トリム＋小文字化）
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * コースキーワードを検出
 */
export function detectCourseKeyword(text: string): DiagnosisKeyword | null {
  const normalized = normalizeKeyword(text);
  const match = COURSE_KEYWORDS.find((kw) => kw === normalized);
  return match ?? null;
}

/**
 * 待機時間（分）を計算
 */
export function calculateWaitMinutes(
  nextAvailable: Date | null,
  defaultMinutes = 60,
): number {
  if (!nextAvailable) return defaultMinutes;
  return Math.max(1, Math.ceil((nextAvailable.getTime() - Date.now()) / 60000));
}

/**
 * 入力長さが制限内かチェック
 */
export function isWithinInputLimit(
  input: string,
  maxLength: number,
): boolean {
  return input.length <= maxLength;
}

/**
 * キャンセルコマンドかどうか判定
 */
export function isCancelCommand(text: string): boolean {
  const cancelWords = ["キャンセル", "cancel", "戻る"];
  return cancelWords.includes(text.trim());
}

/**
 * プレフィックスコマンドを解析
 */
export function parsePolishCommand(
  text: string,
): { isCommand: boolean; input: string } {
  const trimmed = text.trim();
  if (trimmed.startsWith("洗練:") || trimmed.startsWith("polish:")) {
    return {
      isCommand: true,
      input: trimmed.replace(/^洗練:|^polish:/, "").trim(),
    };
  }
  return { isCommand: false, input: "" };
}

/**
 * リスクチェックコマンドを解析
 */
export function parseRiskCheckCommand(
  text: string,
): { isCommand: boolean; input: string } {
  const trimmed = text.trim();
  if (trimmed.startsWith("check:") || trimmed.startsWith("チェック:")) {
    return {
      isCommand: true,
      input: trimmed.replace(/^check:|^チェック:/, "").trim(),
    };
  }
  return { isCommand: false, input: "" };
}
