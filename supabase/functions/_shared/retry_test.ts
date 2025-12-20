/**
 * retry.ts のユニットテスト
 * 指数バックオフ付きリトライロジックのテスト
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.210.0/assert/mod.ts";
import {
  withRetry,
  isRetryableStatus,
  isRetryableError,
} from "./retry.ts";

// ========================================
// isRetryableStatus のテスト
// ========================================

Deno.test("isRetryableStatus returns true for 5xx errors", () => {
  assertEquals(isRetryableStatus(500), true);
  assertEquals(isRetryableStatus(502), true);
  assertEquals(isRetryableStatus(503), true);
  assertEquals(isRetryableStatus(504), true);
});

Deno.test("isRetryableStatus returns true for 429 (rate limit)", () => {
  assertEquals(isRetryableStatus(429), true);
});

Deno.test("isRetryableStatus returns true for 408 (timeout)", () => {
  assertEquals(isRetryableStatus(408), true);
});

Deno.test("isRetryableStatus returns false for 4xx client errors", () => {
  assertEquals(isRetryableStatus(400), false);
  assertEquals(isRetryableStatus(401), false);
  assertEquals(isRetryableStatus(403), false);
  assertEquals(isRetryableStatus(404), false);
  assertEquals(isRetryableStatus(422), false);
});

Deno.test("isRetryableStatus returns false for 2xx success", () => {
  assertEquals(isRetryableStatus(200), false);
  assertEquals(isRetryableStatus(201), false);
  assertEquals(isRetryableStatus(204), false);
});

// ========================================
// isRetryableError のテスト
// ========================================

Deno.test("isRetryableError returns true for network errors", () => {
  assertEquals(isRetryableError(new Error("fetch failed")), true);
  assertEquals(isRetryableError(new Error("network error")), true);
  assertEquals(isRetryableError(new Error("timeout exceeded")), true);
  assertEquals(isRetryableError(new Error("ECONNRESET")), true);
  assertEquals(isRetryableError(new Error("ETIMEDOUT")), true);
  assertEquals(isRetryableError(new Error("request aborted")), true);
});

Deno.test("isRetryableError returns true for unknown errors (default behavior)", () => {
  assertEquals(isRetryableError(new Error("Unknown error")), true);
  assertEquals(isRetryableError("string error"), true);
});

// ========================================
// withRetry のテスト
// ========================================

Deno.test("withRetry succeeds on first attempt", async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts++;
    return "success";
  });

  assertEquals(result, "success");
  assertEquals(attempts, 1);
});

Deno.test("withRetry retries on failure and eventually succeeds", async () => {
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("temporary failure");
      }
      return "success after retries";
    },
    {
      maxRetries: 3,
      initialDelay: 10, // テスト用に短い遅延
      maxDelay: 50,
    }
  );

  assertEquals(result, "success after retries");
  assertEquals(attempts, 3);
});

Deno.test("withRetry throws after max retries exceeded", async () => {
  let attempts = 0;

  await assertRejects(
    async () => {
      await withRetry(
        async () => {
          attempts++;
          throw new Error("persistent failure");
        },
        {
          maxRetries: 2,
          initialDelay: 10,
          maxDelay: 50,
        }
      );
    },
    Error,
    "persistent failure"
  );

  assertEquals(attempts, 3); // 初回 + 2回リトライ
});

Deno.test("withRetry respects shouldRetry option", async () => {
  let attempts = 0;

  await assertRejects(
    async () => {
      await withRetry(
        async () => {
          attempts++;
          throw new Error("NON_RETRYABLE: client error");
        },
        {
          maxRetries: 3,
          initialDelay: 10,
          shouldRetry: (error) => {
            if (error instanceof Error && error.message.startsWith("NON_RETRYABLE")) {
              return false;
            }
            return true;
          },
        }
      );
    },
    Error,
    "NON_RETRYABLE"
  );

  assertEquals(attempts, 1); // リトライなし
});

Deno.test("withRetry calls onRetry callback", async () => {
  let attempts = 0;
  const retryLogs: { attempt: number; delay: number }[] = [];

  await withRetry(
    async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("retry me");
      }
      return "done";
    },
    {
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 400,
      onRetry: (attempt, _error, nextDelay) => {
        retryLogs.push({ attempt, delay: nextDelay });
      },
    }
  );

  assertEquals(retryLogs.length, 2);
  assertEquals(retryLogs[0].attempt, 1);
  assertEquals(retryLogs[0].delay, 100); // 100 * 2^0
  assertEquals(retryLogs[1].attempt, 2);
  assertEquals(retryLogs[1].delay, 200); // 100 * 2^1
});

Deno.test("withRetry respects maxDelay", async () => {
  let attempts = 0;
  const retryDelays: number[] = [];

  await withRetry(
    async () => {
      attempts++;
      if (attempts < 5) {
        throw new Error("keep retrying");
      }
      return "done";
    },
    {
      maxRetries: 5,
      initialDelay: 100,
      maxDelay: 200, // キャップ
      onRetry: (_attempt, _error, nextDelay) => {
        retryDelays.push(nextDelay);
      },
    }
  );

  // 100, 200, 200, 200 (maxDelayでキャップ)
  assertEquals(retryDelays[0], 100);
  assertEquals(retryDelays[1], 200);
  assertEquals(retryDelays[2], 200); // maxDelayでキャップ
  assertEquals(retryDelays[3], 200); // maxDelayでキャップ
});
