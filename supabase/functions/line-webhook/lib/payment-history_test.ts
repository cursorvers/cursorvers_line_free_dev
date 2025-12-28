/**
 * LINE Bot 支払い履歴モジュールのユニットテスト
 */
import { assertEquals } from "std-assert";
import {
  formatPaymentHistoryMessage,
  isPaymentHistoryCommand,
  type PaymentHistoryResult,
} from "./payment-history.ts";

Deno.test("isPaymentHistoryCommand - detects Japanese keywords", () => {
  assertEquals(isPaymentHistoryCommand("支払い履歴"), true);
  assertEquals(isPaymentHistoryCommand("支払履歴"), true);
  assertEquals(isPaymentHistoryCommand("お支払い履歴"), true);
  assertEquals(isPaymentHistoryCommand("決済履歴"), true);
  assertEquals(isPaymentHistoryCommand("履歴確認"), true);
});

Deno.test("isPaymentHistoryCommand - detects English keywords", () => {
  assertEquals(isPaymentHistoryCommand("payment history"), true);
  assertEquals(isPaymentHistoryCommand("payments"), true);
  assertEquals(isPaymentHistoryCommand("Payment History"), true); // case insensitive
});

Deno.test("isPaymentHistoryCommand - rejects unrelated text", () => {
  assertEquals(isPaymentHistoryCommand("こんにちは"), false);
  assertEquals(isPaymentHistoryCommand("ヘルプ"), false);
  assertEquals(isPaymentHistoryCommand("診断"), false);
  assertEquals(isPaymentHistoryCommand("hello"), false);
});

Deno.test("formatPaymentHistoryMessage - handles error case", () => {
  const result: PaymentHistoryResult = {
    success: false,
    payments: [],
    totalPaid: 0,
    error: "Database error",
  };
  const message = formatPaymentHistoryMessage(result);
  assertEquals(message.includes("❌"), true);
  assertEquals(message.includes("失敗"), true);
});

Deno.test("formatPaymentHistoryMessage - handles custom message", () => {
  const result: PaymentHistoryResult = {
    success: true,
    payments: [],
    totalPaid: 0,
    message: "会員情報が見つかりません。",
  };
  const message = formatPaymentHistoryMessage(result);
  assertEquals(message, "会員情報が見つかりません。");
});

Deno.test("formatPaymentHistoryMessage - handles empty payments", () => {
  const result: PaymentHistoryResult = {
    success: true,
    payments: [],
    totalPaid: 0,
  };
  const message = formatPaymentHistoryMessage(result);
  assertEquals(message.includes("まだお支払い履歴がありません"), true);
});

Deno.test("formatPaymentHistoryMessage - formats payments correctly", () => {
  const result: PaymentHistoryResult = {
    success: true,
    payments: [
      {
        id: "ch_123",
        amount: 9800,
        currency: "jpy",
        status: "succeeded",
        description: "Master Class",
        tier: "master",
        created_at: "2024-12-01T00:00:00Z",
        stripe_created: 1701388800, // 2024-12-01
      },
      {
        id: "ch_124",
        amount: 2980,
        currency: "jpy",
        status: "refunded",
        description: "Library Member",
        tier: "library",
        created_at: "2024-11-01T00:00:00Z",
        stripe_created: 1698796800, // 2024-11-01
      },
    ],
    totalPaid: 9800,
  };
  const message = formatPaymentHistoryMessage(result);

  assertEquals(message.includes("📋 支払い履歴"), true);
  assertEquals(message.includes("✅"), true); // succeeded
  assertEquals(message.includes("↩️"), true); // refunded
  assertEquals(message.includes("¥9,800"), true);
  assertEquals(message.includes("Master"), true);
  assertEquals(message.includes("Library"), true);
  assertEquals(message.includes("累計お支払い"), true);
});

Deno.test("formatPaymentHistoryMessage - shows correct status emojis", () => {
  const createResult = (status: string): PaymentHistoryResult => ({
    success: true,
    payments: [
      {
        id: "ch_test",
        amount: 1000,
        currency: "jpy",
        status,
        description: null,
        tier: "library",
        created_at: "2024-12-01T00:00:00Z",
        stripe_created: null,
      },
    ],
    totalPaid: status === "succeeded" ? 1000 : 0,
  });

  assertEquals(formatPaymentHistoryMessage(createResult("succeeded")).includes("✅"), true);
  assertEquals(formatPaymentHistoryMessage(createResult("failed")).includes("❌"), true);
  assertEquals(formatPaymentHistoryMessage(createResult("refunded")).includes("↩️"), true);
  assertEquals(formatPaymentHistoryMessage(createResult("pending")).includes("⏳"), true);
});
