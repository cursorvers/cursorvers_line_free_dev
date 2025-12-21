/**
 * logger.ts のユニットテスト
 * 構造化ロガーモジュールのテスト
 */
import { assertEquals } from "std-assert";
import {
  createLogger,
  anonymizeUserId,
  errorToContext,
} from "./logger.ts";

// ========================================
// anonymizeUserId のテスト
// ========================================

Deno.test("anonymizeUserId returns last 4 characters with prefix", () => {
  const result = anonymizeUserId("user_12345678");
  assertEquals(result, "...5678");
});

Deno.test("anonymizeUserId handles exact 4 character input", () => {
  const result = anonymizeUserId("abcd");
  assertEquals(result, "****");
});

Deno.test("anonymizeUserId handles short input (less than 4 chars)", () => {
  const result = anonymizeUserId("abc");
  assertEquals(result, "****");
});

Deno.test("anonymizeUserId handles empty string", () => {
  const result = anonymizeUserId("");
  assertEquals(result, "****");
});

Deno.test("anonymizeUserId handles long user ID", () => {
  const result = anonymizeUserId("U1234567890abcdefghijklmnop");
  assertEquals(result, "...mnop");
});

// ========================================
// errorToContext のテスト
// ========================================

Deno.test("errorToContext extracts Error properties", () => {
  const error = new Error("Something went wrong");
  const context = errorToContext(error);

  assertEquals(context.errorName, "Error");
  assertEquals(context.errorMessage, "Something went wrong");
  assertEquals(typeof context.errorStack, "string");
});

Deno.test("errorToContext handles custom Error types", () => {
  class CustomError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "CustomError";
    }
  }

  const error = new CustomError("Custom error message");
  const context = errorToContext(error);

  assertEquals(context.errorName, "CustomError");
  assertEquals(context.errorMessage, "Custom error message");
});

Deno.test("errorToContext truncates stack to 3 lines", () => {
  const error = new Error("Test error");
  const context = errorToContext(error);

  if (context.errorStack && typeof context.errorStack === "string") {
    // スタックは " | " で区切られた3行以下
    const pipeCount = (context.errorStack.match(/\|/g) || []).length;
    assertEquals(pipeCount <= 2, true); // 3行なら最大2つの "|"
  }
});

Deno.test("errorToContext handles non-Error values", () => {
  assertEquals(errorToContext("string error"), { error: "string error" });
  assertEquals(errorToContext(123), { error: "123" });
  assertEquals(errorToContext(null), { error: "null" });
  assertEquals(errorToContext(undefined), { error: "undefined" });
  assertEquals(errorToContext({ custom: "object" }), {
    error: "[object Object]",
  });
});

// ========================================
// createLogger のテスト
// ========================================

Deno.test("createLogger returns logger with all methods", () => {
  const logger = createLogger("test-function");

  assertEquals(typeof logger.debug, "function");
  assertEquals(typeof logger.info, "function");
  assertEquals(typeof logger.warn, "function");
  assertEquals(typeof logger.error, "function");
});

Deno.test("createLogger logs include function name", () => {
  const logs: string[] = [];
  const originalLog = console.log;

  try {
    console.log = (msg: string) => {
      logs.push(msg);
    };

    const logger = createLogger("my-function");
    logger.info("Test message");

    assertEquals(logs.length, 1);

    const parsed = JSON.parse(logs[0]);
    assertEquals(parsed.message, "Test message");
    assertEquals(parsed.context?.function, "my-function");
    assertEquals(parsed.level, "info");
    assertEquals(typeof parsed.timestamp, "string");
  } finally {
    console.log = originalLog;
  }
});

Deno.test("createLogger logs include additional context", () => {
  const logs: string[] = [];
  const originalLog = console.log;

  try {
    console.log = (msg: string) => {
      logs.push(msg);
    };

    const logger = createLogger("test");
    logger.info("Message with context", {
      userId: "...1234",
      durationMs: 150,
    });

    const parsed = JSON.parse(logs[0]);
    assertEquals(parsed.context?.userId, "...1234");
    assertEquals(parsed.context?.durationMs, 150);
  } finally {
    console.log = originalLog;
  }
});

Deno.test("createLogger debug uses console.debug", () => {
  let debugCalled = false;
  const originalDebug = console.debug;

  try {
    console.debug = () => {
      debugCalled = true;
    };

    const logger = createLogger("test");
    logger.debug("Debug message");

    assertEquals(debugCalled, true);
  } finally {
    console.debug = originalDebug;
  }
});

Deno.test("createLogger warn uses console.warn", () => {
  let warnCalled = false;
  const originalWarn = console.warn;

  try {
    console.warn = () => {
      warnCalled = true;
    };

    const logger = createLogger("test");
    logger.warn("Warning message");

    assertEquals(warnCalled, true);
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test("createLogger error uses console.error", () => {
  let errorCalled = false;
  const originalError = console.error;

  try {
    console.error = () => {
      errorCalled = true;
    };

    const logger = createLogger("test");
    logger.error("Error message");

    assertEquals(errorCalled, true);
  } finally {
    console.error = originalError;
  }
});

Deno.test("createLogger produces valid JSON output", () => {
  const logs: string[] = [];
  const originalLog = console.log;

  try {
    console.log = (msg: string) => {
      logs.push(msg);
    };

    const logger = createLogger("json-test");
    logger.info("Test");

    // JSONとしてパースできることを確認
    const parsed = JSON.parse(logs[0]);
    assertEquals(typeof parsed, "object");
    assertEquals(Object.keys(parsed).sort(), ["context", "level", "message", "timestamp"]);
  } finally {
    console.log = originalLog;
  }
});
