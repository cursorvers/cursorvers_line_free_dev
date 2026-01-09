/**
 * 日付・時刻ユーティリティ
 */

/**
 * 日本標準時(JST)での現在日時を取得
 */
export function getNowJST(): Date {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000; // UTC+9
  return new Date(now.getTime() + jstOffset);
}

/**
 * 日付をJST形式の文字列に変換 (YYYY-MM-DD)
 */
export function formatDateJST(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const [datePart] = jst.toISOString().split("T");
  return datePart ?? "";
}

/**
 * 日付をJST形式の日時文字列に変換 (YYYY-MM-DD HH:mm)
 */
export function formatDateTimeJST(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const iso = jst.toISOString();
  return iso.slice(0, 16).replace("T", " ");
}

/**
 * 日付が今日かどうかを判定（JST基準）
 */
export function isToday(date: Date): boolean {
  const today = formatDateJST(new Date());
  const target = formatDateJST(date);
  return today === target;
}

/**
 * 日付が過去かどうかを判定
 */
export function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}

/**
 * 日付が将来かどうかを判定
 */
export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

/**
 * 2つの日付の差（日数）を計算
 */
export function diffDays(date1: Date, date2: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((date1.getTime() - date2.getTime()) / msPerDay);
}

/**
 * 日付に日数を加算
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * 週の開始日（月曜日）を取得
 */
export function getWeekStart(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? 6 : day - 1; // 日曜日は6日戻る
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * 月の開始日を取得
 */
export function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * 経過時間を人間が読みやすい形式に変換
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) {
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * 相対時間を文字列で表現（例: "3日前", "2時間後"）
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const suffix = diffMs >= 0 ? "後" : "前";

  if (absMs < 60000) return "たった今";
  if (absMs < 3600000) return `${Math.floor(absMs / 60000)}分${suffix}`;
  if (absMs < 86400000) return `${Math.floor(absMs / 3600000)}時間${suffix}`;
  if (absMs < 2592000000) return `${Math.floor(absMs / 86400000)}日${suffix}`;
  return `${Math.floor(absMs / 2592000000)}ヶ月${suffix}`;
}
