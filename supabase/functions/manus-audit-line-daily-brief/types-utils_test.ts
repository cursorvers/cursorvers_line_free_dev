/**
 * types-utils.ts テスト
 */
import { assertEquals } from "std-assert";
import {
  calculateSuccessRate,
  getWarningLevel,
  isValidAuditMode,
  isValidAuditTrigger,
  isValidCardTheme,
  isValidISODate,
  isWithinDays,
} from "./types-utils.ts";

Deno.test("types-utils - isValidCardTheme", async (t) => {
  await t.step("returns true for valid themes", () => {
    assertEquals(isValidCardTheme("ai_gov"), true);
    assertEquals(isValidCardTheme("tax"), true);
    assertEquals(isValidCardTheme("law"), true);
    assertEquals(isValidCardTheme("biz"), true);
    assertEquals(isValidCardTheme("career"), true);
    assertEquals(isValidCardTheme("asset"), true);
    assertEquals(isValidCardTheme("general"), true);
  });

  await t.step("returns false for invalid themes", () => {
    assertEquals(isValidCardTheme("invalid"), false);
    assertEquals(isValidCardTheme(""), false);
    assertEquals(isValidCardTheme(null), false);
    assertEquals(isValidCardTheme(undefined), false);
    assertEquals(isValidCardTheme(123), false);
  });
});

Deno.test("types-utils - isValidAuditMode", async (t) => {
  await t.step("returns true for valid modes", () => {
    assertEquals(isValidAuditMode("daily"), true);
    assertEquals(isValidAuditMode("weekly"), true);
    assertEquals(isValidAuditMode("monthly"), true);
  });

  await t.step("returns false for invalid modes", () => {
    assertEquals(isValidAuditMode("report"), false); // report is trigger only
    assertEquals(isValidAuditMode("yearly"), false);
    assertEquals(isValidAuditMode(null), false);
  });
});

Deno.test("types-utils - isValidAuditTrigger", async (t) => {
  await t.step("returns true for valid triggers", () => {
    assertEquals(isValidAuditTrigger("daily"), true);
    assertEquals(isValidAuditTrigger("weekly"), true);
    assertEquals(isValidAuditTrigger("monthly"), true);
    assertEquals(isValidAuditTrigger("report"), true);
  });

  await t.step("returns false for invalid triggers", () => {
    assertEquals(isValidAuditTrigger("manual"), false);
    assertEquals(isValidAuditTrigger(""), false);
    assertEquals(isValidAuditTrigger(123), false);
  });
});

Deno.test("types-utils - calculateSuccessRate", async (t) => {
  await t.step("calculates correct percentage", () => {
    assertEquals(calculateSuccessRate(80, 100), 80);
    assertEquals(calculateSuccessRate(95, 100), 95);
    assertEquals(calculateSuccessRate(100, 100), 100);
  });

  await t.step("rounds to integer", () => {
    assertEquals(calculateSuccessRate(1, 3), 33);
    assertEquals(calculateSuccessRate(2, 3), 67);
  });

  await t.step("returns 100 for zero total", () => {
    assertEquals(calculateSuccessRate(0, 0), 100);
  });

  await t.step("handles edge cases", () => {
    assertEquals(calculateSuccessRate(0, 100), 0);
    assertEquals(calculateSuccessRate(50, 100), 50);
  });
});

Deno.test("types-utils - getWarningLevel", async (t) => {
  await t.step("returns critical for rates below 80", () => {
    assertEquals(getWarningLevel(79), "critical");
    assertEquals(getWarningLevel(50), "critical");
    assertEquals(getWarningLevel(0), "critical");
  });

  await t.step("returns warning for rates 80-94", () => {
    assertEquals(getWarningLevel(80), "warning");
    assertEquals(getWarningLevel(90), "warning");
    assertEquals(getWarningLevel(94), "warning");
  });

  await t.step("returns ok for rates 95+", () => {
    assertEquals(getWarningLevel(95), "ok");
    assertEquals(getWarningLevel(100), "ok");
  });
});

Deno.test("types-utils - isWithinDays", async (t) => {
  await t.step("returns true for recent dates", () => {
    const now = new Date();
    assertEquals(isWithinDays(now, 7), true);
  });

  await t.step("returns true for date within range", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    assertEquals(isWithinDays(threeDaysAgo, 7), true);
  });

  await t.step("returns false for old dates", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    assertEquals(isWithinDays(tenDaysAgo, 7), false);
  });

  await t.step("handles string dates", () => {
    const now = new Date().toISOString();
    assertEquals(isWithinDays(now, 1), true);
  });
});

Deno.test("types-utils - isValidISODate", async (t) => {
  await t.step("returns true for valid ISO dates", () => {
    assertEquals(isValidISODate("2025-12-21T10:00:00.000Z"), true);
    assertEquals(isValidISODate("2025-01-01"), true);
    assertEquals(isValidISODate("2025-06-15T12:30:00+09:00"), true);
  });

  await t.step("returns false for invalid dates", () => {
    assertEquals(isValidISODate("invalid"), false);
    assertEquals(isValidISODate(""), false);
    assertEquals(isValidISODate("not-a-date"), false);
  });

  await t.step("returns false for null/undefined", () => {
    assertEquals(isValidISODate(null as unknown as string), false);
    assertEquals(isValidISODate(undefined as unknown as string), false);
  });
});
