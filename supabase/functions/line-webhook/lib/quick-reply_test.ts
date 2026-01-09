/**
 * LINE Quick Reply ビルダーテスト
 */
import { assertEquals, assertExists } from "std-assert";
import {
  buildBackButtonQuickReply,
  buildDiagnosisQuickReply,
  buildNewsletterConfirmQuickReply,
  buildServicesQuickReply,
} from "./quick-reply.ts";
import { COURSE_KEYWORDS } from "./constants.ts";

Deno.test("quick-reply - buildDiagnosisQuickReply", async (t) => {
  await t.step("returns QuickReply with items", () => {
    const result = buildDiagnosisQuickReply();
    assertEquals(typeof result, "object");
    assertEquals(Array.isArray(result.items), true);
  });

  await t.step("includes all course keywords", () => {
    const result = buildDiagnosisQuickReply();
    // Course keywords + contact button
    assertEquals(result.items.length, COURSE_KEYWORDS.length + 1);
  });

  await t.step("has correct action types", () => {
    const result = buildDiagnosisQuickReply();
    for (const item of result.items) {
      assertEquals(item.type, "action");
      assertEquals(item.action.type, "message");
    }
  });

  await t.step("includes contact button", () => {
    const result = buildDiagnosisQuickReply();
    const lastItem = result.items[result.items.length - 1];
    assertExists(lastItem);
    assertEquals(lastItem.action.label, "お問い合わせ");
    assertEquals(lastItem.action.text, "お問い合わせ");
  });

  await t.step("shortens labels by removing 診断", () => {
    const result = buildDiagnosisQuickReply();
    const firstItem = result.items[0];
    // Label should not end with 診断
    assertExists(firstItem);
    assertEquals(firstItem.action.label?.includes("診断"), false);
  });
});

Deno.test("quick-reply - buildServicesQuickReply", async (t) => {
  await t.step("returns QuickReply with 3 items", () => {
    const result = buildServicesQuickReply();
    assertEquals(result.items.length, 3);
  });

  await t.step("includes prompt polishing option", () => {
    const result = buildServicesQuickReply();
    const labels = result.items.map((i) => i.action.label);
    assertEquals(labels.includes("プロンプト整形"), true);
  });

  await t.step("includes risk check option", () => {
    const result = buildServicesQuickReply();
    const labels = result.items.map((i) => i.action.label);
    assertEquals(labels.includes("リスクチェック"), true);
  });

  await t.step("includes service details option", () => {
    const result = buildServicesQuickReply();
    const labels = result.items.map((i) => i.action.label);
    assertEquals(labels.includes("サービス詳細（Web）"), true);
  });

  await t.step("all items are message actions", () => {
    const result = buildServicesQuickReply();
    for (const item of result.items) {
      assertEquals(item.action.type, "message");
    }
  });
});

Deno.test("quick-reply - buildBackButtonQuickReply", async (t) => {
  await t.step("returns single item QuickReply", () => {
    const result = buildBackButtonQuickReply();
    assertEquals(result.items.length, 1);
  });

  await t.step("has back button with correct label", () => {
    const result = buildBackButtonQuickReply();
    const firstItem = result.items[0];
    assertExists(firstItem);
    assertEquals(firstItem.action.label, "← 戻る");
  });

  await t.step("sends 戻る as text", () => {
    const result = buildBackButtonQuickReply();
    const firstItem = result.items[0];
    assertExists(firstItem);
    assertEquals(firstItem.action.text, "戻る");
  });
});

Deno.test("quick-reply - buildNewsletterConfirmQuickReply", async (t) => {
  await t.step("returns 2 items", () => {
    const result = buildNewsletterConfirmQuickReply();
    assertEquals(result.items.length, 2);
  });

  await t.step("uses postback actions", () => {
    const result = buildNewsletterConfirmQuickReply();
    for (const item of result.items) {
      assertEquals(item.action.type, "postback");
    }
  });

  await t.step("has OK option with email_opt_in=yes", () => {
    const result = buildNewsletterConfirmQuickReply();
    const okItem = result.items.find((i) => i.action.label === "OK");
    assertEquals(okItem?.action.data, "email_opt_in=yes");
  });

  await t.step("has decline option with email_opt_in=no", () => {
    const result = buildNewsletterConfirmQuickReply();
    const noItem = result.items.find((i) => i.action.label === "配信しない");
    assertEquals(noItem?.action.data, "email_opt_in=no");
  });

  await t.step("has displayText for postback actions", () => {
    const result = buildNewsletterConfirmQuickReply();
    for (const item of result.items) {
      assertEquals(typeof item.action.displayText, "string");
    }
  });
});
