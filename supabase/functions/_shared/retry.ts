/**
 * 共通リトライユーティリティ
 * 指数バックオフ付きのリトライロジック
 */

import { createLogger } from "./logger.ts";

const log = createLogger("retry");

// デフォルト設定
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 1000; // 1秒
const DEFAULT_MAX_DELAY_MS = 10000; // 10秒

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, nextDelay: number) => void;
}

/**
 * 指数バックオフでリトライ可能な関数を実行
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelay = DEFAULT_INITIAL_DELAY_MS,
    maxDelay = DEFAULT_MAX_DELAY_MS,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // 指数バックオフ: delay = min(initialDelay * 2^attempt, maxDelay)
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);

      if (onRetry) {
        onRetry(attempt + 1, error, delay);
      } else {
        log.warn("Retrying operation", {
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
          nextDelayMs: delay,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * HTTPレスポンスがリトライ可能かどうかを判定
 * - 5xx: サーバーエラー（リトライ可能）
 * - 429: レートリミット（リトライ可能）
 * - 408: タイムアウト（リトライ可能）
 */
export function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}

/**
 * エラーがリトライ可能かどうかを判定
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // ネットワークエラー
    if (
      error.message.includes("fetch") ||
      error.message.includes("network") ||
      error.message.includes("timeout") ||
      error.message.includes("ECONNRESET") ||
      error.message.includes("ETIMEDOUT") ||
      error.message.includes("abort")
    ) {
      return true;
    }
  }
  return true; // デフォルトでリトライ
}
