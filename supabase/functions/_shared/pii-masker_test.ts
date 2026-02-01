/**
 * PIIマスキングユーティリティのテスト
 * Grok送信前に個人情報を自動マスキング
 */

import { assertEquals } from "std-assert";
import { maskPII } from "./pii-masker.ts";

Deno.test("maskPII: masks email address", () => {
  const input = "連絡先: test@example.com";
  const result = maskPII(input);
  assertEquals(result, "連絡先: [EMAIL_MASKED]");
});

Deno.test("maskPII: masks phone number (Japanese format)", () => {
  const input = "電話: 090-1234-5678";
  const result = maskPII(input);
  assertEquals(result, "電話: [PHONE_MASKED]");
});

Deno.test("maskPII: masks phone number (alternative format)", () => {
  const input = "電話: 03-1234-5678";
  const result = maskPII(input);
  assertEquals(result, "電話: [PHONE_MASKED]");
});

Deno.test("maskPII: masks credit card number", () => {
  const input = "カード: 1234-5678-9012-3456";
  const result = maskPII(input);
  assertEquals(result, "カード: [CC_MASKED]");
});

Deno.test("maskPII: avoids false positive for word 'email'", () => {
  const input = "email という単語";
  const result = maskPII(input);
  assertEquals(result, "email という単語");
});

Deno.test("maskPII: masks multiple PII in one string", () => {
  const input = "メール: a@b.com, 電話: 090-1234-5678";
  const result = maskPII(input);
  assertEquals(result, "メール: [EMAIL_MASKED], 電話: [PHONE_MASKED]");
});

Deno.test("maskPII: handles empty string", () => {
  const input = "";
  const result = maskPII(input);
  assertEquals(result, "");
});

Deno.test("maskPII: handles string with no PII", () => {
  const input = "今日はいい天気ですね";
  const result = maskPII(input);
  assertEquals(result, "今日はいい天気ですね");
});

Deno.test("maskPII: masks multiple emails", () => {
  const input = "contact: user@example.com, admin@test.jp";
  const result = maskPII(input);
  assertEquals(result, "contact: [EMAIL_MASKED], [EMAIL_MASKED]");
});

Deno.test("maskPII: masks Japanese mobile number (no hyphen)", () => {
  const input = "携帯: 09012345678";
  const result = maskPII(input);
  assertEquals(result, "携帯: [PHONE_MASKED]");
});
