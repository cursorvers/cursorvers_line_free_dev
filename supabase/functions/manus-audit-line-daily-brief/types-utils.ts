/**
 * Manus Audit 型ユーティリティ
 */
import type { AuditMode, AuditTrigger, CardTheme } from "./types.ts";

const VALID_THEMES: CardTheme[] = [
  "ai_gov",
  "tax",
  "law",
  "biz",
  "career",
  "asset",
  "general",
];

const VALID_MODES: AuditMode[] = ["daily", "weekly", "monthly"];
const VALID_TRIGGERS: AuditTrigger[] = ["daily", "weekly", "monthly", "report"];

/**
 * CardThemeが有効かどうかをチェック
 */
export function isValidCardTheme(theme: unknown): theme is CardTheme {
  return typeof theme === "string" && VALID_THEMES.includes(theme as CardTheme);
}

/**
 * AuditModeが有効かどうかをチェック
 */
export function isValidAuditMode(mode: unknown): mode is AuditMode {
  return typeof mode === "string" && VALID_MODES.includes(mode as AuditMode);
}

/**
 * AuditTriggerが有効かどうかをチェック
 */
export function isValidAuditTrigger(trigger: unknown): trigger is AuditTrigger {
  return typeof trigger === "string" &&
    VALID_TRIGGERS.includes(trigger as AuditTrigger);
}

/**
 * 成功率を計算（0-100の範囲）
 */
export function calculateSuccessRate(
  successful: number,
  total: number,
): number {
  if (total === 0) return 100;
  return Math.round((successful / total) * 100);
}

/**
 * 警告レベルを判定
 */
export function getWarningLevel(
  successRate: number,
): "critical" | "warning" | "ok" {
  if (successRate < 80) return "critical";
  if (successRate < 95) return "warning";
  return "ok";
}

/**
 * 日付が指定日数以内かどうかをチェック
 */
export function isWithinDays(date: Date | string, days: number): boolean {
  const target = typeof date === "string" ? new Date(date) : date;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return target >= cutoff;
}

/**
 * ISO日付文字列が有効かどうかをチェック
 */
export function isValidISODate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}
