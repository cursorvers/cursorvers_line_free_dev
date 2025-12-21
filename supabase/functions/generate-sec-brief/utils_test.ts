/**
 * generate-sec-brief ユーティリティテスト
 */
import { assertEquals } from "std-assert";
import { buildUserPrompt, getWeekStart, splitMessage } from "./utils.ts";

Deno.test("generate-sec-brief - getWeekStart", async (t) => {
  await t.step("returns Monday for a Monday date", () => {
    // 2025-12-22 is a Monday
    const date = new Date("2025-12-22T12:00:00Z");
    assertEquals(getWeekStart(date), "2025-12-22");
  });

  await t.step("returns Monday for a Wednesday date", () => {
    // 2025-12-24 is a Wednesday
    const date = new Date("2025-12-24T12:00:00Z");
    assertEquals(getWeekStart(date), "2025-12-22");
  });

  await t.step("returns Monday for a Friday date", () => {
    // 2025-12-26 is a Friday
    const date = new Date("2025-12-26T12:00:00Z");
    assertEquals(getWeekStart(date), "2025-12-22");
  });

  await t.step("returns Monday for a Sunday date", () => {
    // 2025-12-28 is a Sunday
    const date = new Date("2025-12-28T12:00:00Z");
    assertEquals(getWeekStart(date), "2025-12-22");
  });

  await t.step("returns Monday for a Saturday date", () => {
    // 2025-12-27 is a Saturday
    const date = new Date("2025-12-27T12:00:00Z");
    assertEquals(getWeekStart(date), "2025-12-22");
  });

  await t.step("handles year boundary correctly", () => {
    // 2026-01-01 is a Thursday (week starts 2025-12-29)
    const date = new Date("2026-01-01T12:00:00Z");
    assertEquals(getWeekStart(date), "2025-12-29");
  });
});

Deno.test("generate-sec-brief - splitMessage", async (t) => {
  await t.step("returns single chunk for short text", () => {
    const text = "短いテキスト";
    const result = splitMessage(text, 100);
    assertEquals(result.length, 1);
    assertEquals(result[0], text);
  });

  await t.step("splits at newline when possible", () => {
    // 20+ characters per line, maxLength 15 = need to split
    const text =
      "これは一行目の内容です\nこれは二行目の内容です\nこれは三行目です";
    const result = splitMessage(text, 15);
    assertEquals(result.length > 1, true);
    // First chunk should not contain second line
    assertEquals(result[0].includes("二行目"), false);
  });

  await t.step("handles text without newlines", () => {
    const text =
      "これは改行なしの長いテキストです。スペースで区切られています。";
    const result = splitMessage(text, 20);
    assertEquals(result.length > 1, true);
  });

  await t.step("handles empty text", () => {
    const result = splitMessage("", 100);
    assertEquals(result.length, 0);
  });

  await t.step("splits exactly at maxLength if no good break point", () => {
    const text = "あいうえおかきくけこさしすせそたちつてとなにぬねの";
    const result = splitMessage(text, 10);
    assertEquals(result.length > 1, true);
    // Each chunk should be at most maxLength
    for (const chunk of result) {
      assertEquals(chunk.length <= 10, true);
    }
  });

  await t.step("Discord limit: splits long message correctly", () => {
    // Simulate a long Discord message
    const longText = "セキュリティ警告: ".repeat(200);
    const result = splitMessage(longText, 1900);
    assertEquals(result.length > 1, true);
    for (const chunk of result) {
      assertEquals(chunk.length <= 1900, true);
    }
  });
});

Deno.test("generate-sec-brief - buildUserPrompt", async (t) => {
  await t.step("includes week_start in prompt", () => {
    const result = buildUserPrompt("テスト内容", "2025-12-22");
    assertEquals(result.includes("2025-12-22"), true);
  });

  await t.step("includes combined text in prompt", () => {
    const text = "セキュリティニュースの本文テスト";
    const result = buildUserPrompt(text, "2025-12-22");
    assertEquals(result.includes(text), true);
  });

  await t.step("includes JSON schema instructions", () => {
    const result = buildUserPrompt("テスト", "2025-12-22");
    assertEquals(result.includes("JSONスキーマ"), true);
    assertEquals(result.includes("topics"), true);
    assertEquals(result.includes("body_markdown"), true);
  });

  await t.step("includes source requirements", () => {
    const result = buildUserPrompt("テスト", "2025-12-22");
    assertEquals(result.includes("Proofpoint"), true);
    assertEquals(result.includes("CISA"), true);
    assertEquals(result.includes("CVE"), true);
  });

  await t.step("wraps combined text with markers", () => {
    const text = "ニュース内容";
    const result = buildUserPrompt(text, "2025-12-22");
    assertEquals(result.includes("<<<"), true);
    assertEquals(result.includes(">>>"), true);
  });
});
