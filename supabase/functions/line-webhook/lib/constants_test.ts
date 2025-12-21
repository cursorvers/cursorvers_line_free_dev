/**
 * constants.ts テスト
 */
import { assertEquals } from "std-assert";
import {
  CONTACT_FORM_URL,
  COURSE_KEYWORDS,
  DISCORD_INVITE_URL,
  SERVICES_LP_URL,
} from "./constants.ts";
import type { DiagnosisKeyword } from "./constants.ts";

Deno.test("constants - DISCORD_INVITE_URL", async (t) => {
  await t.step("is a valid Discord invite URL", () => {
    assertEquals(DISCORD_INVITE_URL.startsWith("https://discord.gg/"), true);
  });

  await t.step("is not empty", () => {
    assertEquals(DISCORD_INVITE_URL.length > 0, true);
  });
});

Deno.test("constants - CONTACT_FORM_URL", async (t) => {
  await t.step("is a valid Google Apps Script URL", () => {
    assertEquals(
      CONTACT_FORM_URL.startsWith("https://script.google.com/macros/"),
      true,
    );
  });

  await t.step("ends with /exec", () => {
    assertEquals(CONTACT_FORM_URL.endsWith("/exec"), true);
  });
});

Deno.test("constants - SERVICES_LP_URL", async (t) => {
  await t.step("is a valid GitHub Pages URL", () => {
    assertEquals(
      SERVICES_LP_URL.startsWith("https://cursorvers.github.io/"),
      true,
    );
  });

  await t.step("ends with .html", () => {
    assertEquals(SERVICES_LP_URL.endsWith(".html"), true);
  });
});

Deno.test("constants - COURSE_KEYWORDS", async (t) => {
  await t.step("has 7 keywords", () => {
    assertEquals(COURSE_KEYWORDS.length, 7);
  });

  await t.step("includes 病院AIリスク診断", () => {
    assertEquals(COURSE_KEYWORDS.includes("病院AIリスク診断"), true);
  });

  await t.step("includes SaMDスタートアップ診断", () => {
    assertEquals(COURSE_KEYWORDS.includes("SaMDスタートアップ診断"), true);
  });

  await t.step("includes クイック診断", () => {
    assertEquals(COURSE_KEYWORDS.includes("クイック診断"), true);
  });

  await t.step("all keywords end with 診断", () => {
    for (const keyword of COURSE_KEYWORDS) {
      assertEquals(keyword.endsWith("診断"), true);
    }
  });

  await t.step("all keywords are unique", () => {
    const unique = new Set(COURSE_KEYWORDS);
    assertEquals(unique.size, COURSE_KEYWORDS.length);
  });

  await t.step("DiagnosisKeyword type works correctly", () => {
    const keyword: DiagnosisKeyword = "クイック診断";
    assertEquals(typeof keyword, "string");
  });
});
