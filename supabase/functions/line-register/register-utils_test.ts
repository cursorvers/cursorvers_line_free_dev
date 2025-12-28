/**
 * line-register register-utils テスト
 */
import { assertEquals } from "std-assert";
import {
  CORS_HEADERS,
  createErrorResponse,
  createSuccessResponse,
  getJSTTimestamp,
  isValidEmailFormat,
  isValidLineUserId,
  normalizeEmail,
  parseOptInEmail,
} from "./register-utils.ts";

Deno.test("register-utils - getJSTTimestamp", async (t) => {
  await t.step("returns ISO format with +09:00 suffix", () => {
    const result = getJSTTimestamp(new Date("2025-01-01T00:00:00Z"));
    assertEquals(result.endsWith("+09:00"), true);
  });

  await t.step("formats date correctly", () => {
    const result = getJSTTimestamp(new Date("2025-06-15T12:30:45Z"));
    assertEquals(result.includes("2025-06-15"), true);
  });

  await t.step("uses current date when no argument", () => {
    const result = getJSTTimestamp();
    assertEquals(typeof result, "string");
    assertEquals(result.endsWith("+09:00"), true);
  });
});

Deno.test("register-utils - normalizeEmail", async (t) => {
  await t.step("trims whitespace", () => {
    assertEquals(normalizeEmail("  test@example.com  "), "test@example.com");
  });

  await t.step("converts to lowercase", () => {
    assertEquals(normalizeEmail("TEST@EXAMPLE.COM"), "test@example.com");
  });

  await t.step("handles mixed case and whitespace", () => {
    assertEquals(normalizeEmail("  TeSt@ExAmPlE.cOm  "), "test@example.com");
  });

  await t.step("returns null for null input", () => {
    assertEquals(normalizeEmail(null), null);
  });

  await t.step("returns null for undefined input", () => {
    assertEquals(normalizeEmail(undefined), null);
  });

  await t.step("returns null for empty string", () => {
    assertEquals(normalizeEmail(""), null);
  });

  await t.step("returns null for whitespace only", () => {
    assertEquals(normalizeEmail("   "), null);
  });
});

Deno.test("register-utils - isValidEmailFormat", async (t) => {
  await t.step("returns true for valid emails", () => {
    assertEquals(isValidEmailFormat("test@example.com"), true);
    assertEquals(isValidEmailFormat("user.name@domain.co.jp"), true);
    assertEquals(isValidEmailFormat("user+tag@gmail.com"), true);
    assertEquals(isValidEmailFormat("a@b.co"), true);
  });

  await t.step("returns false for invalid emails", () => {
    assertEquals(isValidEmailFormat("notanemail"), false);
    assertEquals(isValidEmailFormat("missing@domain"), false);
    assertEquals(isValidEmailFormat("@nodomain.com"), false);
    assertEquals(isValidEmailFormat("spaces in@email.com"), false);
    assertEquals(isValidEmailFormat(""), false);
  });
});

Deno.test("register-utils - isValidLineUserId", async (t) => {
  await t.step("returns true for valid LINE User ID", () => {
    assertEquals(isValidLineUserId("U1234567890abcdef1234567890abcdef"), true);
    assertEquals(isValidLineUserId("Uabcdef1234567890abcdef1234567890"), true);
  });

  await t.step("returns true for uppercase hex", () => {
    assertEquals(isValidLineUserId("UABCDEF1234567890ABCDEF1234567890"), true);
  });

  await t.step("returns false for wrong prefix", () => {
    assertEquals(isValidLineUserId("X1234567890abcdef1234567890abcdef"), false);
    assertEquals(isValidLineUserId("A1234567890abcdef1234567890abcdef"), false);
  });

  await t.step("accepts lowercase u prefix (case insensitive)", () => {
    // 正規表現に /i フラグがあるため小文字も許可
    assertEquals(isValidLineUserId("u1234567890abcdef1234567890abcdef"), true);
  });

  await t.step("returns false for wrong length", () => {
    assertEquals(isValidLineUserId("U123"), false);
    assertEquals(
      isValidLineUserId("U1234567890abcdef1234567890abcdef0"),
      false,
    );
  });

  await t.step("returns false for invalid characters", () => {
    assertEquals(isValidLineUserId("U1234567890ghijkl1234567890abcdef"), false);
  });

  await t.step("returns false for empty/null/undefined", () => {
    assertEquals(isValidLineUserId(""), false);
    assertEquals(isValidLineUserId(null as unknown as string), false);
    assertEquals(isValidLineUserId(undefined as unknown as string), false);
  });
});

Deno.test("register-utils - parseOptInEmail", async (t) => {
  await t.step("returns boolean value directly", () => {
    assertEquals(parseOptInEmail(true), true);
    assertEquals(parseOptInEmail(false), false);
  });

  await t.step("parses string 'false' as false", () => {
    assertEquals(parseOptInEmail("false"), false);
    assertEquals(parseOptInEmail("FALSE"), false);
    assertEquals(parseOptInEmail("False"), false);
  });

  await t.step("parses other strings as true", () => {
    assertEquals(parseOptInEmail("true"), true);
    assertEquals(parseOptInEmail("yes"), true);
    assertEquals(parseOptInEmail("1"), true);
    assertEquals(parseOptInEmail(""), true);
  });

  await t.step("returns true for null/undefined (default)", () => {
    assertEquals(parseOptInEmail(null), true);
    assertEquals(parseOptInEmail(undefined), true);
  });

  await t.step("returns true for other types", () => {
    assertEquals(parseOptInEmail(123), true);
    assertEquals(parseOptInEmail({}), true);
    assertEquals(parseOptInEmail([]), true);
  });
});

Deno.test("register-utils - CORS_HEADERS", async (t) => {
  await t.step("has Content-Type header", () => {
    assertEquals(CORS_HEADERS["Content-Type"], "application/json");
  });

  await t.step(
    "has Access-Control-Allow-Origin header (specific origin for security)",
    () => {
      // CORS_HEADERS now uses specific origins instead of "*" for security
      assertEquals(
        CORS_HEADERS["Access-Control-Allow-Origin"],
        "https://cursorvers.com",
      );
    },
  );

  await t.step("allows POST and OPTIONS methods", () => {
    assertEquals(CORS_HEADERS["Access-Control-Allow-Methods"], "POST, OPTIONS");
  });

  await t.step("allows required headers", () => {
    assertEquals(
      CORS_HEADERS["Access-Control-Allow-Headers"],
      "Content-Type, x-api-key",
    );
  });
});

Deno.test("register-utils - createErrorResponse", async (t) => {
  await t.step("creates response with error message", async () => {
    const response = createErrorResponse("Test error");
    const body = await response.json();

    assertEquals(body.error, "Test error");
  });

  await t.step("uses default status 400", () => {
    const response = createErrorResponse("Test error");
    assertEquals(response.status, 400);
  });

  await t.step("uses custom status when provided", () => {
    const response = createErrorResponse("Not found", 404);
    assertEquals(response.status, 404);
  });

  await t.step("uses custom status 500", () => {
    const response = createErrorResponse("Server error", 500);
    assertEquals(response.status, 500);
  });

  await t.step("includes CORS headers by default", () => {
    const response = createErrorResponse("Test error");
    assertEquals(response.headers.get("Content-Type"), "application/json");
    assertEquals(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://cursorvers.com",
    );
  });
});

Deno.test("register-utils - createSuccessResponse", async (t) => {
  await t.step("creates response with data", async () => {
    const response = createSuccessResponse({ success: true, id: "123" });
    const body = await response.json();

    assertEquals(body.success, true);
    assertEquals(body.id, "123");
  });

  await t.step("uses status 200", () => {
    const response = createSuccessResponse({ ok: true });
    assertEquals(response.status, 200);
  });

  await t.step("includes CORS headers by default", () => {
    const response = createSuccessResponse({});
    assertEquals(response.headers.get("Content-Type"), "application/json");
    assertEquals(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://cursorvers.com",
    );
  });

  await t.step("handles complex data", async () => {
    const data = {
      user: { id: "123", name: "Test" },
      items: [1, 2, 3],
      nested: { a: { b: { c: "deep" } } },
    };
    const response = createSuccessResponse(data);
    const body = await response.json();

    assertEquals(body.user.id, "123");
    assertEquals(body.items.length, 3);
    assertEquals(body.nested.a.b.c, "deep");
  });
});
