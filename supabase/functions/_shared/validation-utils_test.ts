/**
 * validation-utils.ts テスト
 */
import { assertEquals } from "std-assert";
import {
  isInRange,
  isNonEmptyArray,
  isNonEmptyString,
  isNonNegativeInteger,
  isPositiveInteger,
  isValidBase64,
  isValidEmail,
  isValidISO8601,
  isValidJapanesePhone,
  isValidJSON,
  isValidUrl,
  isValidUUID,
} from "./validation-utils.ts";

Deno.test("validation-utils - isValidEmail", async (t) => {
  await t.step("returns true for valid emails", () => {
    assertEquals(isValidEmail("test@example.com"), true);
    assertEquals(isValidEmail("user.name@domain.co.jp"), true);
    assertEquals(isValidEmail("user+tag@example.org"), true);
  });

  await t.step("returns false for invalid emails", () => {
    assertEquals(isValidEmail("invalid"), false);
    assertEquals(isValidEmail("@example.com"), false);
    assertEquals(isValidEmail("test@"), false);
    assertEquals(isValidEmail("test@.com"), false);
    assertEquals(isValidEmail(""), false);
  });

  await t.step("returns false for null/undefined", () => {
    assertEquals(isValidEmail(null as unknown as string), false);
    assertEquals(isValidEmail(undefined as unknown as string), false);
  });
});

Deno.test("validation-utils - isValidUrl", async (t) => {
  await t.step("returns true for valid URLs", () => {
    assertEquals(isValidUrl("https://example.com"), true);
    assertEquals(isValidUrl("http://localhost:3000"), true);
    assertEquals(isValidUrl("https://sub.domain.co.jp/path?query=1"), true);
  });

  await t.step("returns false for invalid URLs", () => {
    assertEquals(isValidUrl("not-a-url"), false);
    assertEquals(isValidUrl("ftp://example.com"), false);
    assertEquals(isValidUrl(""), false);
  });

  await t.step("returns false for null/undefined", () => {
    assertEquals(isValidUrl(null as unknown as string), false);
  });
});

Deno.test("validation-utils - isValidJapanesePhone", async (t) => {
  await t.step("returns true for valid Japanese phone numbers", () => {
    assertEquals(isValidJapanesePhone("09012345678"), true);
    assertEquals(isValidJapanesePhone("03-1234-5678"), true);
    assertEquals(isValidJapanesePhone("0120-123-456"), true);
  });

  await t.step("returns false for invalid phone numbers", () => {
    assertEquals(isValidJapanesePhone("12345678"), false);
    assertEquals(isValidJapanesePhone("+819012345678"), false);
    assertEquals(isValidJapanesePhone(""), false);
  });
});

Deno.test("validation-utils - isNonEmptyString", async (t) => {
  await t.step("returns true for non-empty strings", () => {
    assertEquals(isNonEmptyString("hello"), true);
    assertEquals(isNonEmptyString("a"), true);
  });

  await t.step("returns false for empty or whitespace strings", () => {
    assertEquals(isNonEmptyString(""), false);
    assertEquals(isNonEmptyString("   "), false);
    assertEquals(isNonEmptyString("\t\n"), false);
  });

  await t.step("returns false for non-strings", () => {
    assertEquals(isNonEmptyString(null), false);
    assertEquals(isNonEmptyString(undefined), false);
    assertEquals(isNonEmptyString(123), false);
    assertEquals(isNonEmptyString({}), false);
  });
});

Deno.test("validation-utils - isPositiveInteger", async (t) => {
  await t.step("returns true for positive integers", () => {
    assertEquals(isPositiveInteger(1), true);
    assertEquals(isPositiveInteger(100), true);
    assertEquals(isPositiveInteger(999999), true);
  });

  await t.step("returns false for zero", () => {
    assertEquals(isPositiveInteger(0), false);
  });

  await t.step("returns false for negative numbers", () => {
    assertEquals(isPositiveInteger(-1), false);
    assertEquals(isPositiveInteger(-100), false);
  });

  await t.step("returns false for non-integers", () => {
    assertEquals(isPositiveInteger(1.5), false);
    assertEquals(isPositiveInteger(NaN), false);
    assertEquals(isPositiveInteger(Infinity), false);
  });
});

Deno.test("validation-utils - isNonNegativeInteger", async (t) => {
  await t.step("returns true for zero and positive integers", () => {
    assertEquals(isNonNegativeInteger(0), true);
    assertEquals(isNonNegativeInteger(1), true);
    assertEquals(isNonNegativeInteger(100), true);
  });

  await t.step("returns false for negative numbers", () => {
    assertEquals(isNonNegativeInteger(-1), false);
  });

  await t.step("returns false for non-integers", () => {
    assertEquals(isNonNegativeInteger(0.5), false);
    assertEquals(isNonNegativeInteger("1" as unknown as number), false);
  });
});

Deno.test("validation-utils - isInRange", async (t) => {
  await t.step("returns true for values in range", () => {
    assertEquals(isInRange(5, 1, 10), true);
    assertEquals(isInRange(1, 1, 10), true);
    assertEquals(isInRange(10, 1, 10), true);
  });

  await t.step("returns false for values out of range", () => {
    assertEquals(isInRange(0, 1, 10), false);
    assertEquals(isInRange(11, 1, 10), false);
    assertEquals(isInRange(-5, 0, 100), false);
  });
});

Deno.test("validation-utils - isNonEmptyArray", async (t) => {
  await t.step("returns true for non-empty arrays", () => {
    assertEquals(isNonEmptyArray([1, 2, 3]), true);
    assertEquals(isNonEmptyArray(["a"]), true);
  });

  await t.step("returns false for empty arrays", () => {
    assertEquals(isNonEmptyArray([]), false);
  });

  await t.step("returns false for non-arrays", () => {
    assertEquals(isNonEmptyArray(null), false);
    assertEquals(isNonEmptyArray({}), false);
    assertEquals(isNonEmptyArray("string"), false);
  });
});

Deno.test("validation-utils - isValidUUID", async (t) => {
  await t.step("returns true for valid UUIDs", () => {
    assertEquals(isValidUUID("550e8400-e29b-41d4-a716-446655440000"), true);
    assertEquals(isValidUUID("f47ac10b-58cc-4372-a567-0e02b2c3d479"), true);
  });

  await t.step("returns false for invalid UUIDs", () => {
    assertEquals(isValidUUID("not-a-uuid"), false);
    assertEquals(isValidUUID("550e8400-e29b-41d4-a716"), false);
    assertEquals(isValidUUID(""), false);
  });
});

Deno.test("validation-utils - isValidISO8601", async (t) => {
  await t.step("returns true for valid ISO 8601 dates", () => {
    assertEquals(isValidISO8601("2025-12-21T10:00:00.000Z"), true);
    assertEquals(isValidISO8601("2025-12-21T10:00:00+09:00"), true);
  });

  await t.step("returns false for non-ISO dates", () => {
    assertEquals(isValidISO8601("2025-12-21"), false);
    assertEquals(isValidISO8601("December 21, 2025"), false);
    assertEquals(isValidISO8601(""), false);
  });
});

Deno.test("validation-utils - isValidJSON", async (t) => {
  await t.step("returns true for valid JSON", () => {
    assertEquals(isValidJSON('{"key":"value"}'), true);
    assertEquals(isValidJSON("[1,2,3]"), true);
    assertEquals(isValidJSON('"string"'), true);
    assertEquals(isValidJSON("123"), true);
    assertEquals(isValidJSON("true"), true);
    assertEquals(isValidJSON("null"), true);
  });

  await t.step("returns false for invalid JSON", () => {
    assertEquals(isValidJSON("{invalid}"), false);
    assertEquals(isValidJSON("undefined"), false);
    assertEquals(isValidJSON(""), false);
  });
});

Deno.test("validation-utils - isValidBase64", async (t) => {
  await t.step("returns true for valid Base64", () => {
    assertEquals(isValidBase64("SGVsbG8="), true);
    assertEquals(isValidBase64("YWJjZA=="), true);
    assertEquals(isValidBase64("dGVzdA=="), true);
  });

  await t.step("returns false for invalid Base64", () => {
    assertEquals(isValidBase64("Hello!"), false);
    assertEquals(isValidBase64("abc"), false); // Not multiple of 4
    assertEquals(isValidBase64(""), false);
  });
});
