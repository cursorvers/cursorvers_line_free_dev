/**
 * date-utils.ts テスト
 */
import { assertEquals } from "std-assert";
import {
  addDays,
  diffDays,
  formatDateJST,
  formatDateTimeJST,
  formatDuration,
  formatRelativeTime,
  getMonthStart,
  getWeekStart,
  isFuture,
  isPast,
} from "./date-utils.ts";

Deno.test("date-utils - formatDateJST", async (t) => {
  await t.step("formats date correctly", () => {
    // UTC midnight = JST 9:00
    const date = new Date("2025-12-21T00:00:00.000Z");
    assertEquals(formatDateJST(date), "2025-12-21");
  });

  await t.step("handles date near midnight JST", () => {
    // UTC 15:00 = JST midnight (next day)
    const date = new Date("2025-12-21T15:00:00.000Z");
    assertEquals(formatDateJST(date), "2025-12-22");
  });
});

Deno.test("date-utils - formatDateTimeJST", async (t) => {
  await t.step("formats datetime correctly", () => {
    const date = new Date("2025-12-21T00:00:00.000Z");
    assertEquals(formatDateTimeJST(date), "2025-12-21 09:00");
  });

  await t.step("handles afternoon time", () => {
    const date = new Date("2025-12-21T03:30:00.000Z");
    assertEquals(formatDateTimeJST(date), "2025-12-21 12:30");
  });
});

Deno.test("date-utils - isPast/isFuture", async (t) => {
  await t.step("isPast returns true for past dates", () => {
    const past = new Date(Date.now() - 86400000); // 1 day ago
    assertEquals(isPast(past), true);
    assertEquals(isFuture(past), false);
  });

  await t.step("isFuture returns true for future dates", () => {
    const future = new Date(Date.now() + 86400000); // 1 day later
    assertEquals(isFuture(future), true);
    assertEquals(isPast(future), false);
  });
});

Deno.test("date-utils - diffDays", async (t) => {
  await t.step("calculates positive difference", () => {
    const date1 = new Date("2025-12-25");
    const date2 = new Date("2025-12-21");
    assertEquals(diffDays(date1, date2), 4);
  });

  await t.step("calculates negative difference", () => {
    const date1 = new Date("2025-12-21");
    const date2 = new Date("2025-12-25");
    assertEquals(diffDays(date1, date2), -4);
  });

  await t.step("returns zero for same date", () => {
    const date = new Date("2025-12-21");
    assertEquals(diffDays(date, date), 0);
  });
});

Deno.test("date-utils - addDays", async (t) => {
  await t.step("adds positive days", () => {
    const date = new Date("2025-12-21");
    const result = addDays(date, 5);
    assertEquals(result.getDate(), 26);
  });

  await t.step("handles month boundary", () => {
    const date = new Date("2025-12-30");
    const result = addDays(date, 5);
    assertEquals(result.getMonth(), 0); // January
    assertEquals(result.getDate(), 4);
  });

  await t.step("subtracts negative days", () => {
    const date = new Date("2025-12-21");
    const result = addDays(date, -5);
    assertEquals(result.getDate(), 16);
  });
});

Deno.test("date-utils - getWeekStart", async (t) => {
  await t.step("gets Monday for a Thursday", () => {
    // 2025-12-25 is Thursday
    const date = new Date("2025-12-25T12:00:00Z");
    const result = getWeekStart(date);
    assertEquals(result.getDay(), 1); // Monday
    assertEquals(result.getDate(), 22);
  });

  await t.step("gets same day for Monday", () => {
    // 2025-12-22 is Monday
    const date = new Date("2025-12-22T12:00:00Z");
    const result = getWeekStart(date);
    assertEquals(result.getDate(), 22);
  });

  await t.step("handles Sunday correctly", () => {
    // 2025-12-21 is Sunday
    const date = new Date("2025-12-21T12:00:00Z");
    const result = getWeekStart(date);
    assertEquals(result.getDay(), 1); // Monday
    assertEquals(result.getDate(), 15);
  });
});

Deno.test("date-utils - getMonthStart", async (t) => {
  await t.step("gets first day of month", () => {
    const date = new Date("2025-12-21");
    const result = getMonthStart(date);
    assertEquals(result.getDate(), 1);
    assertEquals(result.getMonth(), 11); // December (0-indexed)
  });

  await t.step("handles first day of month", () => {
    const date = new Date("2025-01-01");
    const result = getMonthStart(date);
    assertEquals(result.getDate(), 1);
  });
});

Deno.test("date-utils - formatDuration", async (t) => {
  await t.step("formats milliseconds", () => {
    assertEquals(formatDuration(500), "500ms");
  });

  await t.step("formats seconds", () => {
    assertEquals(formatDuration(2500), "2.5s");
    assertEquals(formatDuration(30000), "30.0s");
  });

  await t.step("formats minutes and seconds", () => {
    assertEquals(formatDuration(65000), "1m 5s");
    assertEquals(formatDuration(125000), "2m 5s");
  });

  await t.step("formats hours and minutes", () => {
    assertEquals(formatDuration(3665000), "1h 1m");
    assertEquals(formatDuration(7200000), "2h 0m");
  });
});

Deno.test("date-utils - formatRelativeTime", async (t) => {
  const now = new Date("2025-12-21T12:00:00Z");

  await t.step("formats 'just now'", () => {
    const date = new Date(now.getTime() + 30000);
    assertEquals(formatRelativeTime(date, now), "たった今");
  });

  await t.step("formats minutes ago", () => {
    const date = new Date(now.getTime() - 5 * 60 * 1000);
    assertEquals(formatRelativeTime(date, now), "5分前");
  });

  await t.step("formats hours later", () => {
    const date = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    assertEquals(formatRelativeTime(date, now), "3時間後");
  });

  await t.step("formats days ago", () => {
    const date = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    assertEquals(formatRelativeTime(date, now), "5日前");
  });

  await t.step("formats months", () => {
    const date = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    assertEquals(formatRelativeTime(date, now), "2ヶ月前");
  });
});
