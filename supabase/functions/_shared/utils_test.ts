/**
 * _shared/utils ユーティリティテスト
 */
import { assertEquals, assertExists, assertThrows } from "std-assert";
import { hexToUint8Array, splitMessage } from "./utils.ts";

Deno.test("utils - splitMessage", async (t) => {
  await t.step("returns single chunk for short messages", () => {
    const result = splitMessage("Hello, World!", 100);
    assertEquals(result.length, 1);
    assertEquals(result[0], "Hello, World!");
  });

  await t.step("splits at newlines", () => {
    const text = "Line 1\nLine 2\nLine 3";
    const result = splitMessage(text, 10);

    for (const chunk of result) {
      assertEquals(chunk.length <= 10, true);
    }
  });

  await t.step("splits at spaces when no newlines", () => {
    const text = "word1 word2 word3 word4 word5";
    const result = splitMessage(text, 15);

    for (const chunk of result) {
      assertEquals(chunk.length <= 15, true);
    }
  });

  await t.step("force splits long continuous text", () => {
    const text = "a".repeat(300);
    const result = splitMessage(text, 100);

    assertEquals(result.length, 3);
    const [first, second, third] = result;
    assertExists(first);
    assertExists(second);
    assertExists(third);
    assertEquals(first.length, 100);
    assertEquals(second.length, 100);
    assertEquals(third.length, 100);
  });

  await t.step("handles empty string", () => {
    const result = splitMessage("", 100);
    assertEquals(result.length, 0);
  });

  await t.step("trims remaining after split", () => {
    const text = "Hello\n   World";
    const result = splitMessage(text, 6);

    assertEquals(result[0], "Hello");
    assertEquals(result[1], "World"); // trimmed
  });

  await t.step("prefers newlines over spaces", () => {
    const text = "First part\nSecond part";
    const result = splitMessage(text, 15);

    assertEquals(result[0], "First part");
    assertEquals(result[1], "Second part");
  });
});

Deno.test("utils - hexToUint8Array", async (t) => {
  await t.step("converts hex string to Uint8Array", () => {
    const result = hexToUint8Array("48656c6c6f");
    assertEquals(result, new Uint8Array([72, 101, 108, 108, 111]));
  });

  await t.step("handles uppercase hex", () => {
    const result = hexToUint8Array("AABBCC");
    assertEquals(result, new Uint8Array([170, 187, 204]));
  });

  await t.step("handles mixed case", () => {
    const result = hexToUint8Array("aAbBcC");
    assertEquals(result, new Uint8Array([170, 187, 204]));
  });

  await t.step("throws for empty string", () => {
    assertThrows(() => hexToUint8Array(""));
  });

  await t.step("handles single byte", () => {
    const result = hexToUint8Array("ff");
    assertEquals(result, new Uint8Array([255]));
  });

  await t.step("handles zero byte", () => {
    const result = hexToUint8Array("00");
    assertEquals(result, new Uint8Array([0]));
  });

  await t.step("converts signature-like hex", () => {
    // Discord signature verification uses 64-byte signatures
    const hex = "ab".repeat(64);
    const result = hexToUint8Array(hex);
    assertEquals(result.length, 64);
    assertEquals(result[0], 171); // 0xab
  });
});
