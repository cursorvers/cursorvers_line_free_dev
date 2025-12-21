/**
 * Quick Reply Builder Unit Tests
 */

import { assertEquals, assertExists } from "std-assert";
import {
  buildBackButtonQuickReply,
  buildDiagnosisQuickReply,
  buildNewsletterConfirmQuickReply,
  buildServicesQuickReply,
} from "../quick-reply.ts";
import { COURSE_KEYWORDS } from "../constants.ts";

Deno.test("buildDiagnosisQuickReply - returns valid QuickReply structure", () => {
  const result = buildDiagnosisQuickReply();

  assertExists(result.items);
  assertEquals(Array.isArray(result.items), true);
  // 6 diagnosis keywords + 1 contact button
  assertEquals(result.items.length, COURSE_KEYWORDS.length + 1);
});

Deno.test("buildDiagnosisQuickReply - includes all course keywords", () => {
  const result = buildDiagnosisQuickReply();

  COURSE_KEYWORDS.forEach((keyword) => {
    const found = result.items.some(
      (item) => item.action.type === "message" && item.action.text === keyword,
    );
    assertEquals(found, true, `Should include keyword: ${keyword}`);
  });
});

Deno.test("buildDiagnosisQuickReply - includes contact button", () => {
  const result = buildDiagnosisQuickReply();

  const contactButton = result.items.find(
    (item) =>
      item.action.type === "message" && item.action.text === "お問い合わせ",
  );
  assertExists(contactButton);
  assertEquals(contactButton.action.label, "お問い合わせ");
});

Deno.test("buildDiagnosisQuickReply - all items have correct type", () => {
  const result = buildDiagnosisQuickReply();

  result.items.forEach((item) => {
    assertEquals(item.type, "action");
    assertEquals(item.action.type, "message");
    assertExists(item.action.label);
    assertExists(item.action.text);
  });
});

Deno.test("buildServicesQuickReply - returns 3 items", () => {
  const result = buildServicesQuickReply();

  assertEquals(result.items.length, 3);
});

Deno.test("buildServicesQuickReply - includes correct service labels", () => {
  const result = buildServicesQuickReply();

  const labels = result.items.map((item) => item.action.label);

  assertEquals(labels.includes("プロンプト整形"), true);
  assertEquals(labels.includes("リスクチェック"), true);
  assertEquals(labels.includes("サービス詳細（Web）"), true);
});

Deno.test("buildServicesQuickReply - all items are message actions", () => {
  const result = buildServicesQuickReply();

  result.items.forEach((item) => {
    assertEquals(item.type, "action");
    assertEquals(item.action.type, "message");
  });
});

Deno.test("buildBackButtonQuickReply - returns single item", () => {
  const result = buildBackButtonQuickReply();

  assertEquals(result.items.length, 1);
});

Deno.test("buildBackButtonQuickReply - has correct back button", () => {
  const result = buildBackButtonQuickReply();

  assertEquals(result.items[0].action.label, "← 戻る");
  assertEquals(result.items[0].action.text, "戻る");
  assertEquals(result.items[0].action.type, "message");
});

Deno.test("buildNewsletterConfirmQuickReply - returns 2 items", () => {
  const result = buildNewsletterConfirmQuickReply();

  assertEquals(result.items.length, 2);
});

Deno.test("buildNewsletterConfirmQuickReply - uses postback actions", () => {
  const result = buildNewsletterConfirmQuickReply();

  result.items.forEach((item) => {
    assertEquals(item.type, "action");
    assertEquals(item.action.type, "postback");
  });
});

Deno.test("buildNewsletterConfirmQuickReply - has OK and decline options", () => {
  const result = buildNewsletterConfirmQuickReply();

  const okButton = result.items.find((item) => item.action.label === "OK");
  const declineButton = result.items.find(
    (item) => item.action.label === "配信しない",
  );

  assertExists(okButton);
  assertExists(declineButton);

  // Check postback data
  assertEquals((okButton.action as { data: string }).data, "email_opt_in=yes");
  assertEquals(
    (declineButton.action as { data: string }).data,
    "email_opt_in=no",
  );
});

Deno.test("all quick replies - labels are not too long", () => {
  const maxLabelLength = 20; // LINE's limit

  const allReplies = [
    buildDiagnosisQuickReply(),
    buildServicesQuickReply(),
    buildBackButtonQuickReply(),
    buildNewsletterConfirmQuickReply(),
  ];

  allReplies.forEach((reply) => {
    reply.items.forEach((item) => {
      const label = item.action.label;
      assertEquals(
        label.length <= maxLabelLength,
        true,
        `Label "${label}" is too long (${label.length} > ${maxLabelLength})`,
      );
    });
  });
});

Deno.test("all quick replies - have 13 or fewer items", () => {
  const maxItems = 13; // LINE's limit

  const allReplies = [
    { name: "diagnosis", reply: buildDiagnosisQuickReply() },
    { name: "services", reply: buildServicesQuickReply() },
    { name: "back", reply: buildBackButtonQuickReply() },
    { name: "newsletter", reply: buildNewsletterConfirmQuickReply() },
  ];

  allReplies.forEach(({ name, reply }) => {
    assertEquals(
      reply.items.length <= maxItems,
      true,
      `${name} has too many items (${reply.items.length} > ${maxItems})`,
    );
  });
});
