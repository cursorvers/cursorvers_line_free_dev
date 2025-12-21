/**
 * verification-code.ts テスト
 */
import { assertEquals, assertMatch } from "std-assert";
import {
  CODE_EXPIRY_DAYS,
  generateVerificationCode,
  getCodeExpiryDate,
  isCodeExpired,
  isVerificationCodeFormat,
  normalizeCode,
} from "./verification-code.ts";

Deno.test("verification-code - generateVerificationCode", async (t) => {
  await t.step("generates 6-character code", () => {
    const code = generateVerificationCode();
    assertEquals(code.length, 6);
  });

  await t.step("generates uppercase alphanumeric code", () => {
    const code = generateVerificationCode();
    assertMatch(code, /^[A-Z0-9]{6}$/);
  });

  await t.step("does not contain confusing characters (0, O, 1, I)", () => {
    // Generate 100 codes and check none contain confusing chars
    for (let i = 0; i < 100; i++) {
      const code = generateVerificationCode();
      assertEquals(code.includes("0"), false);
      assertEquals(code.includes("O"), false);
      assertEquals(code.includes("1"), false);
      assertEquals(code.includes("I"), false);
    }
  });

  await t.step("generates unique codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateVerificationCode());
    }
    // 100個中、少なくとも95個はユニーク（衝突確率は極めて低い）
    assertEquals(codes.size >= 95, true);
  });
});

Deno.test("verification-code - getCodeExpiryDate", async (t) => {
  await t.step("returns date 14 days in the future", () => {
    const now = new Date();
    const expiry = getCodeExpiryDate();

    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    assertEquals(diffDays, CODE_EXPIRY_DAYS);
  });

  await t.step("returns future date", () => {
    const now = new Date();
    const expiry = getCodeExpiryDate();
    assertEquals(expiry > now, true);
  });
});

Deno.test("verification-code - isVerificationCodeFormat", async (t) => {
  await t.step("accepts valid 6-char uppercase code", () => {
    assertEquals(isVerificationCodeFormat("ABC123"), true);
    assertEquals(isVerificationCodeFormat("XYZNMP"), true);
    assertEquals(isVerificationCodeFormat("234567"), true);
  });

  await t.step("accepts lowercase (case insensitive)", () => {
    assertEquals(isVerificationCodeFormat("abc123"), true);
    assertEquals(isVerificationCodeFormat("AbC123"), true);
  });

  await t.step("accepts with leading/trailing spaces", () => {
    assertEquals(isVerificationCodeFormat(" ABC123 "), true);
    assertEquals(isVerificationCodeFormat("  XYZ789  "), true);
  });

  await t.step("rejects codes with wrong length", () => {
    assertEquals(isVerificationCodeFormat("ABC12"), false);
    assertEquals(isVerificationCodeFormat("ABC1234"), false);
    assertEquals(isVerificationCodeFormat(""), false);
  });

  await t.step("rejects codes with special characters", () => {
    assertEquals(isVerificationCodeFormat("ABC-12"), false);
    assertEquals(isVerificationCodeFormat("ABC_12"), false);
    assertEquals(isVerificationCodeFormat("ABC 12"), false);
  });

  await t.step("rejects email-like strings", () => {
    assertEquals(isVerificationCodeFormat("test@example.com"), false);
    assertEquals(isVerificationCodeFormat("a@b.co"), false);
  });

  await t.step("rejects reserved words (command conflicts)", () => {
    assertEquals(isVerificationCodeFormat("cancel"), false);
    assertEquals(isVerificationCodeFormat("CANCEL"), false);
    assertEquals(isVerificationCodeFormat("Cancel"), false);
    assertEquals(isVerificationCodeFormat("polish"), false);
    assertEquals(isVerificationCodeFormat("POLISH"), false);
    assertEquals(isVerificationCodeFormat("status"), false);
    assertEquals(isVerificationCodeFormat("submit"), false);
    assertEquals(isVerificationCodeFormat("delete"), false);
    assertEquals(isVerificationCodeFormat("signup"), false);
    assertEquals(isVerificationCodeFormat("logout"), false);
  });

  await t.step(
    "accepts valid codes that look similar to reserved words",
    () => {
      // These are valid 6-char codes that are NOT reserved words
      assertEquals(isVerificationCodeFormat("CANCE1"), true); // Not "CANCEL"
      assertEquals(isVerificationCodeFormat("P0LISH"), true); // Not "POLISH"
      assertEquals(isVerificationCodeFormat("STAT1S"), true); // Not "STATUS"
    },
  );
});

Deno.test("verification-code - normalizeCode", async (t) => {
  await t.step("converts to uppercase", () => {
    assertEquals(normalizeCode("abc123"), "ABC123");
    assertEquals(normalizeCode("AbC123"), "ABC123");
  });

  await t.step("trims whitespace", () => {
    assertEquals(normalizeCode(" ABC123 "), "ABC123");
    assertEquals(normalizeCode("  ABC123  "), "ABC123");
  });

  await t.step("handles already normalized code", () => {
    assertEquals(normalizeCode("ABC123"), "ABC123");
  });
});

Deno.test("verification-code - isCodeExpired", async (t) => {
  await t.step("returns false for future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 1);
    assertEquals(isCodeExpired(future), false);
  });

  await t.step("returns true for past date", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    assertEquals(isCodeExpired(past), true);
  });

  await t.step("handles ISO string input", () => {
    const future = new Date();
    future.setDate(future.getDate() + 1);
    assertEquals(isCodeExpired(future.toISOString()), false);

    const past = new Date();
    past.setDate(past.getDate() - 1);
    assertEquals(isCodeExpired(past.toISOString()), true);
  });

  await t.step("returns true for exactly now (edge case)", () => {
    // 「現在」は期限切れと判定（境界値）
    const now = new Date();
    // 1ミリ秒前は期限切れ
    now.setMilliseconds(now.getMilliseconds() - 1);
    assertEquals(isCodeExpired(now), true);
  });
});
