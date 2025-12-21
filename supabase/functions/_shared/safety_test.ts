/**
 * safety.ts テスト
 */
import { assertEquals } from "std-assert";
import { SAFETY_FOOTER, withSafetyFooter } from "./safety.ts";

Deno.test("safety - withSafetyFooter", async (t) => {
  await t.step("returns text unchanged (footer deprecated)", () => {
    const text = "テストメッセージ";
    assertEquals(withSafetyFooter(text), text);
  });

  await t.step("handles empty string", () => {
    assertEquals(withSafetyFooter(""), "");
  });

  await t.step("handles multiline text", () => {
    const text = "行1\n行2\n行3";
    assertEquals(withSafetyFooter(text), text);
  });

  await t.step("handles text with special characters", () => {
    const text = "特殊文字: !@#$%^&*()";
    assertEquals(withSafetyFooter(text), text);
  });
});

Deno.test("safety - SAFETY_FOOTER", async (t) => {
  await t.step("is empty string (deprecated)", () => {
    assertEquals(SAFETY_FOOTER, "");
  });

  await t.step("is string type", () => {
    assertEquals(typeof SAFETY_FOOTER, "string");
  });
});
