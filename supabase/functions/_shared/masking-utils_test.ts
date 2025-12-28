/**
 * マスキングユーティリティのテスト
 */
import { assertEquals } from "std-assert";
import {
  maskDiscordUserId,
  maskEmail,
  maskLineUserId,
  maskVerificationCode,
} from "./masking-utils.ts";

Deno.test("maskEmail", async (t) => {
  await t.step("masks email after first 5 characters", () => {
    assertEquals(maskEmail("test@example.com"), "test@***");
    assertEquals(maskEmail("hello@world.co.jp"), "hello***");
  });

  await t.step("handles short emails", () => {
    assertEquals(maskEmail("ab@x"), "ab@x***");
    assertEquals(maskEmail("a"), "a***");
  });

  await t.step("returns null for null/undefined", () => {
    assertEquals(maskEmail(null), null);
    assertEquals(maskEmail(undefined), null);
    assertEquals(maskEmail(""), null);
  });
});

Deno.test("maskLineUserId", async (t) => {
  await t.step("masks LINE user ID showing last 4 characters", () => {
    assertEquals(maskLineUserId("U1234567890abcdef"), "cdef");
    assertEquals(maskLineUserId("U123456789"), "6789");
  });

  await t.step("handles short IDs", () => {
    assertEquals(maskLineUserId("abc"), "abc");
    assertEquals(maskLineUserId("a"), "a");
  });

  await t.step("returns null for null/undefined", () => {
    assertEquals(maskLineUserId(null), null);
    assertEquals(maskLineUserId(undefined), null);
    assertEquals(maskLineUserId(""), null);
  });
});

Deno.test("maskDiscordUserId", async (t) => {
  await t.step("masks Discord user ID showing last 4 characters", () => {
    assertEquals(maskDiscordUserId("123456789012345678"), "5678");
    assertEquals(maskDiscordUserId("9876543210"), "3210");
  });

  await t.step("returns null for null/undefined", () => {
    assertEquals(maskDiscordUserId(null), null);
    assertEquals(maskDiscordUserId(undefined), null);
  });
});

Deno.test("maskVerificationCode", async (t) => {
  await t.step("masks verification code showing first 2 characters", () => {
    assertEquals(maskVerificationCode("ABC123"), "AB****");
    assertEquals(maskVerificationCode("XY9999"), "XY****");
  });

  await t.step("handles short codes", () => {
    assertEquals(maskVerificationCode("AB"), "AB****");
    assertEquals(maskVerificationCode("A"), "A****");
  });

  await t.step("returns null for null/undefined", () => {
    assertEquals(maskVerificationCode(null), null);
    assertEquals(maskVerificationCode(undefined), null);
  });
});
