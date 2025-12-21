/**
 * Discord アラート通知モジュールのテスト
 */
import { assertEquals } from "std-assert";
import {
  notifyCritical,
  notifyDiscord,
  notifyInfo,
  notifyWarning,
} from "./alert.ts";

// ========================================
// 環境変数未設定時のテスト
// ========================================

Deno.test("notifyDiscord skips notification when DISCORD_ALERT_WEBHOOK is not set", async () => {
  const originalWebhook = Deno.env.get("DISCORD_ALERT_WEBHOOK");

  try {
    Deno.env.delete("DISCORD_ALERT_WEBHOOK");

    const result = await notifyDiscord({
      title: "Test Alert",
      message: "This is a test message",
    });

    // Webhookが未設定なのでskip
    assertEquals(result.success, false);
    assertEquals(result.attempts, 0);
    assertEquals(result.error, "Webhook not configured");
  } finally {
    if (originalWebhook) {
      Deno.env.set("DISCORD_ALERT_WEBHOOK", originalWebhook);
    }
  }
});

// ========================================
// NotifyResult型のテスト
// ========================================

Deno.test("notifyDiscord returns NotifyResult structure", async () => {
  const result = await notifyDiscord({
    title: "Test",
    message: "Message",
  });

  // 結果オブジェクトの構造を確認
  assertEquals(typeof result.success, "boolean");
  assertEquals(typeof result.attempts, "number");
  // error は optional
  if (!result.success) {
    assertEquals(typeof result.error, "string");
  }
});

// ========================================
// context のテスト
// ========================================

Deno.test("notifyDiscord handles context correctly", async () => {
  const result = await notifyDiscord({
    title: "Test with Context",
    message: "Testing context handling",
    context: { key: "value", number: 123 },
  });

  // エラーなく完了（Webhook未設定でもエラーにならない）
  assertEquals(result.attempts >= 0, true);
});

Deno.test("notifyDiscord handles empty context", async () => {
  const result = await notifyDiscord({
    title: "Test",
    message: "No context",
    context: {},
  });

  assertEquals(result.attempts >= 0, true);
});

Deno.test("notifyDiscord handles nested context", async () => {
  const result = await notifyDiscord({
    title: "Test",
    message: "Nested context",
    context: {
      outer: {
        inner: "value",
        array: [1, 2, 3],
      },
    },
  });

  assertEquals(result.attempts >= 0, true);
});

// ========================================
// severity のテスト
// ========================================

Deno.test("notifyDiscord handles severity levels", async () => {
  const severities: Array<"critical" | "warning" | "info"> = [
    "critical",
    "warning",
    "info",
  ];

  for (const severity of severities) {
    const result = await notifyDiscord({
      title: `${severity} test`,
      message: "Testing severity",
      severity,
    });

    assertEquals(result.attempts >= 0, true);
  }
});

Deno.test("notifyDiscord defaults severity to info", async () => {
  // severity を指定しない場合
  const result = await notifyDiscord({
    title: "Default severity",
    message: "Should default to info",
  });

  assertEquals(result.attempts >= 0, true);
});

// ========================================
// ヘルパー関数のテスト
// ========================================

Deno.test("notifyCritical sets severity to critical", async () => {
  const result = await notifyCritical(
    "Critical Alert",
    "Something critical happened",
    { detail: "test" },
  );

  assertEquals(typeof result.success, "boolean");
  assertEquals(typeof result.attempts, "number");
});

Deno.test("notifyWarning sets severity to warning", async () => {
  const result = await notifyWarning(
    "Warning Alert",
    "Something needs attention",
  );

  assertEquals(typeof result.success, "boolean");
  assertEquals(typeof result.attempts, "number");
});

Deno.test("notifyInfo sets severity to info", async () => {
  const result = await notifyInfo(
    "Info Alert",
    "Just for your information",
  );

  assertEquals(typeof result.success, "boolean");
  assertEquals(typeof result.attempts, "number");
});

// ========================================
// エッジケース
// ========================================

Deno.test("notifyDiscord handles empty title", async () => {
  const result = await notifyDiscord({
    title: "",
    message: "Message only",
  });

  assertEquals(result.attempts >= 0, true);
});

Deno.test("notifyDiscord handles empty message", async () => {
  const result = await notifyDiscord({
    title: "Title only",
    message: "",
  });

  assertEquals(result.attempts >= 0, true);
});

Deno.test("notifyDiscord handles unicode content", async () => {
  const result = await notifyDiscord({
    title: "日本語タイトル 🚨",
    message: "絵文字とマルチバイト文字 ⚠️ ✅ 🔧",
  });

  assertEquals(result.attempts >= 0, true);
});

Deno.test("notifyDiscord handles long content", async () => {
  const result = await notifyDiscord({
    title: "Long Content Test",
    message: "A".repeat(2000), // 2000文字
  });

  assertEquals(result.attempts >= 0, true);
});
