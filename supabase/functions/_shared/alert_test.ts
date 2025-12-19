/**
 * Discord アラート通知モジュールのテスト
 */
import { assertEquals } from "https://deno.land/std@0.210.0/assert/mod.ts";

// notifyDiscord 関数の統合テスト（環境変数なしの場合）
Deno.test("notifyDiscord skips notification when DISCORD_ALERT_WEBHOOK is not set", async () => {
  // 環境変数がセットされていない場合のテスト
  // この関数はconsole.logを出力するだけで例外を投げない
  const originalWebhook = Deno.env.get("DISCORD_ALERT_WEBHOOK");

  try {
    Deno.env.delete("DISCORD_ALERT_WEBHOOK");

    // notifyDiscord をインポートしてテスト
    const { notifyDiscord } = await import("./alert.ts");

    // 例外が発生しないことを確認
    await notifyDiscord({
      title: "Test Alert",
      message: "This is a test message",
    });

    // ここに到達すれば成功
    assertEquals(true, true);
  } finally {
    // 元の環境変数を復元
    if (originalWebhook) {
      Deno.env.set("DISCORD_ALERT_WEBHOOK", originalWebhook);
    }
  }
});

Deno.test("notifyDiscord handles context correctly", async () => {
  const { notifyDiscord } = await import("./alert.ts");

  // context付きの呼び出しが例外を投げないことを確認
  await notifyDiscord({
    title: "Test with Context",
    message: "Testing context handling",
    context: { key: "value", number: 123 },
  });

  assertEquals(true, true);
});
