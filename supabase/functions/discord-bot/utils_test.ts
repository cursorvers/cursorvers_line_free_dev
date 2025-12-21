/**
 * discord-bot ユーティリティテスト
 */
import { assertEquals, assertThrows } from "std-assert";
import {
  hexToUint8Array,
  isValidEmail,
  normalizeEmail,
  splitMessage,
} from "./utils.ts";

Deno.test("discord-bot - hexToUint8Array", async (t) => {
  await t.step("converts valid hex to Uint8Array", () => {
    const result = hexToUint8Array("48656c6c6f"); // "Hello" in hex
    assertEquals(result, new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
  });

  await t.step("handles lowercase hex", () => {
    const result = hexToUint8Array("aabbcc");
    assertEquals(result, new Uint8Array([0xaa, 0xbb, 0xcc]));
  });

  await t.step("handles uppercase hex", () => {
    const result = hexToUint8Array("AABBCC");
    assertEquals(result, new Uint8Array([0xaa, 0xbb, 0xcc]));
  });

  await t.step("handles mixed case hex", () => {
    const result = hexToUint8Array("AaBbCc");
    assertEquals(result, new Uint8Array([0xaa, 0xbb, 0xcc]));
  });

  await t.step("handles single byte", () => {
    const result = hexToUint8Array("ff");
    assertEquals(result, new Uint8Array([0xff]));
  });

  await t.step("throws for empty string", () => {
    assertThrows(() => hexToUint8Array(""), Error, "Invalid hex string");
  });
});

Deno.test("discord-bot - splitMessage", async (t) => {
  await t.step("returns single chunk for short text", () => {
    const text = "Hello world";
    const result = splitMessage(text, 100);
    assertEquals(result.length, 1);
    assertEquals(result[0], text);
  });

  await t.step("splits at newline when possible", () => {
    const text = "Line 1\nLine 2\nLine 3";
    const result = splitMessage(text, 8);
    assertEquals(result.length > 1, true);
  });

  await t.step("handles empty text", () => {
    const result = splitMessage("", 100);
    assertEquals(result.length, 0);
  });

  await t.step("respects maxLength", () => {
    const text = "a".repeat(100);
    const result = splitMessage(text, 20);
    for (const chunk of result) {
      assertEquals(chunk.length <= 20, true);
    }
  });

  await t.step("handles Discord 2000 char limit", () => {
    const longText = "セキュリティアラート ".repeat(300);
    const result = splitMessage(longText, 1900);
    for (const chunk of result) {
      assertEquals(chunk.length <= 1900, true);
    }
  });
});

Deno.test("discord-bot - normalizeEmail", async (t) => {
  await t.step("trims whitespace", () => {
    assertEquals(normalizeEmail("  test@example.com  "), "test@example.com");
  });

  await t.step("converts to lowercase", () => {
    assertEquals(normalizeEmail("Test@Example.COM"), "test@example.com");
  });

  await t.step("handles number input", () => {
    assertEquals(normalizeEmail(12345), "12345");
  });

  await t.step("returns empty string for null", () => {
    assertEquals(normalizeEmail(null), "");
  });

  await t.step("returns empty string for undefined", () => {
    assertEquals(normalizeEmail(undefined), "");
  });

  await t.step("returns empty string for object", () => {
    assertEquals(normalizeEmail({}), "");
  });

  await t.step("handles empty string", () => {
    assertEquals(normalizeEmail(""), "");
  });
});

Deno.test("discord-bot - isValidEmail", async (t) => {
  await t.step("accepts valid email", () => {
    assertEquals(isValidEmail("test@example.com"), true);
  });

  await t.step("accepts email with subdomain", () => {
    assertEquals(isValidEmail("test@mail.example.com"), true);
  });

  await t.step("accepts email with plus sign", () => {
    assertEquals(isValidEmail("test+tag@example.com"), true);
  });

  await t.step("accepts email with dots", () => {
    assertEquals(isValidEmail("first.last@example.com"), true);
  });

  await t.step("rejects email without @", () => {
    assertEquals(isValidEmail("testexample.com"), false);
  });

  await t.step("rejects email without domain", () => {
    assertEquals(isValidEmail("test@"), false);
  });

  await t.step("rejects email without username", () => {
    assertEquals(isValidEmail("@example.com"), false);
  });

  await t.step("rejects email with spaces", () => {
    assertEquals(isValidEmail("test @example.com"), false);
  });

  await t.step("rejects empty string", () => {
    assertEquals(isValidEmail(""), false);
  });

  await t.step("rejects plain text", () => {
    assertEquals(isValidEmail("notanemail"), false);
  });
});
