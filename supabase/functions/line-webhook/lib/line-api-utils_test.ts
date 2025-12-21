/**
 * line-api-utils テスト
 */
import { assertEquals } from "std-assert";
import {
  createMessageAction,
  createPostbackAction,
  createQuickReply,
  isValidLineUserId,
  limitQuickReplyItems,
  truncateLabel,
  truncateMessage,
} from "./line-api-utils.ts";

Deno.test("line-api-utils - createMessageAction", async (t) => {
  await t.step("creates message action item", () => {
    const item = createMessageAction("テスト", "test message");
    assertEquals(item.type, "action");
    assertEquals(item.action.type, "message");
    assertEquals(item.action.label, "テスト");
    assertEquals(item.action.text, "test message");
  });

  await t.step("truncates long labels", () => {
    const longLabel = "これは20文字を超える非常に長いラベルです";
    const item = createMessageAction(longLabel, "text");
    assertEquals(item.action.label!.length <= 20, true);
    assertEquals(item.action.label!.endsWith("..."), true);
  });

  await t.step("keeps short labels unchanged", () => {
    const item = createMessageAction("短いラベル", "text");
    assertEquals(item.action.label, "短いラベル");
  });
});

Deno.test("line-api-utils - createPostbackAction", async (t) => {
  await t.step("creates postback action item", () => {
    const item = createPostbackAction("ラベル", "data=value", "表示テキスト");
    assertEquals(item.type, "action");
    assertEquals(item.action.type, "postback");
    assertEquals(item.action.label, "ラベル");
    assertEquals(item.action.data, "data=value");
    assertEquals(item.action.displayText, "表示テキスト");
  });

  await t.step("uses label as displayText when not provided", () => {
    const item = createPostbackAction("ラベル", "data=value");
    assertEquals(item.action.displayText, "ラベル");
  });

  await t.step("truncates long labels", () => {
    const longLabel = "これは20文字を超える非常に長いラベルです";
    const item = createPostbackAction(longLabel, "data");
    assertEquals(item.action.label!.length <= 20, true);
  });
});

Deno.test("line-api-utils - createQuickReply", async (t) => {
  await t.step("creates QuickReply with items", () => {
    const items = [
      createMessageAction("A", "a"),
      createMessageAction("B", "b"),
    ];
    const qr = createQuickReply(items);
    assertEquals(qr.items.length, 2);
  });

  await t.step("creates empty QuickReply", () => {
    const qr = createQuickReply([]);
    assertEquals(qr.items.length, 0);
  });
});

Deno.test("line-api-utils - truncateMessage", async (t) => {
  await t.step("keeps short messages unchanged", () => {
    const msg = "短いメッセージ";
    assertEquals(truncateMessage(msg), msg);
  });

  await t.step("truncates long messages", () => {
    const msg = "あ".repeat(6000);
    const result = truncateMessage(msg);
    assertEquals(result.length <= 5000, true);
    assertEquals(result.includes("続きあり"), true);
  });

  await t.step("respects custom maxLength", () => {
    const msg = "あ".repeat(200);
    const result = truncateMessage(msg, 100);
    assertEquals(result.length <= 100, true);
  });

  await t.step("handles exactly maxLength", () => {
    const msg = "あ".repeat(100);
    const result = truncateMessage(msg, 100);
    assertEquals(result, msg);
  });
});

Deno.test("line-api-utils - truncateLabel", async (t) => {
  await t.step("keeps short labels unchanged", () => {
    const label = "短いラベル";
    assertEquals(truncateLabel(label), label);
  });

  await t.step("truncates long labels to 20 chars", () => {
    const label = "これは20文字を超える非常に長いラベルです"; // 21文字
    const result = truncateLabel(label);
    assertEquals(result.length, 20);
    assertEquals(result.endsWith("..."), true);
  });

  await t.step("respects custom maxLength", () => {
    const label = "あいうえおかきくけこ";
    const result = truncateLabel(label, 5);
    assertEquals(result.length, 5);
    assertEquals(result.endsWith("..."), true);
  });

  await t.step("handles empty string", () => {
    assertEquals(truncateLabel(""), "");
  });
});

Deno.test("line-api-utils - isValidLineUserId", async (t) => {
  await t.step("returns true for valid LINE User ID", () => {
    assertEquals(
      isValidLineUserId("U1234567890abcdef1234567890abcdef"),
      true,
    );
  });

  await t.step("returns true for uppercase hex", () => {
    assertEquals(
      isValidLineUserId("UABCDEF1234567890ABCDEF1234567890"),
      true,
    );
  });

  await t.step("returns true for mixed case hex", () => {
    assertEquals(
      isValidLineUserId("UaBcDeF1234567890AbCdEf1234567890"),
      true,
    );
  });

  await t.step("returns false for missing U prefix", () => {
    assertEquals(
      isValidLineUserId("1234567890abcdef1234567890abcdef"),
      false,
    );
  });

  await t.step("returns false for wrong length", () => {
    assertEquals(isValidLineUserId("U123456"), false);
    assertEquals(
      isValidLineUserId("U1234567890abcdef1234567890abcdef1234"),
      false,
    );
  });

  await t.step("returns false for invalid characters", () => {
    assertEquals(
      isValidLineUserId("U1234567890ghijkl1234567890ghijkl"),
      false,
    );
  });

  await t.step("returns false for empty string", () => {
    assertEquals(isValidLineUserId(""), false);
  });

  await t.step("returns false for null/undefined", () => {
    assertEquals(isValidLineUserId(null as unknown as string), false);
    assertEquals(isValidLineUserId(undefined as unknown as string), false);
  });
});

Deno.test("line-api-utils - limitQuickReplyItems", async (t) => {
  await t.step("limits to 13 items by default", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const result = limitQuickReplyItems(items);
    assertEquals(result.length, 13);
  });

  await t.step("keeps arrays under limit unchanged", () => {
    const items = [1, 2, 3];
    const result = limitQuickReplyItems(items);
    assertEquals(result.length, 3);
  });

  await t.step("respects custom maxItems", () => {
    const items = [1, 2, 3, 4, 5];
    const result = limitQuickReplyItems(items, 3);
    assertEquals(result.length, 3);
  });

  await t.step("handles empty array", () => {
    const result = limitQuickReplyItems([]);
    assertEquals(result.length, 0);
  });

  await t.step("preserves original item order", () => {
    const items = [1, 2, 3, 4, 5];
    const result = limitQuickReplyItems(items, 3);
    assertEquals(result, [1, 2, 3]);
  });
});
