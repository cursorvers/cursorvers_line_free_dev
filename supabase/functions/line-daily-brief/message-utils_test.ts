/**
 * line-daily-brief message-utils テスト
 */
import { assertEquals } from "std-assert";
import {
  CardTheme,
  formatMessage,
  generateBodyPreview,
  getThemeEmoji,
  isValidMessageLength,
  LineCard,
  MAX_MESSAGE_LENGTH,
  MESSAGE_FOOTER,
  THEME_EMOJI,
} from "./message-utils.ts";

// テスト用カード生成ヘルパー
function createTestCard(overrides: Partial<LineCard> = {}): LineCard {
  return {
    id: "test-id",
    body: "これはテスト用のカード本文です。",
    theme: "ai_gov",
    source_path: "/test/path.md",
    times_used: 0,
    status: "ready",
    ...overrides,
  };
}

Deno.test("message-utils - THEME_EMOJI", async (t) => {
  await t.step("has emoji for all themes", () => {
    const themes: CardTheme[] = [
      "ai_gov",
      "tax",
      "law",
      "biz",
      "career",
      "asset",
      "general",
    ];

    for (const theme of themes) {
      assertEquals(typeof THEME_EMOJI[theme], "string");
      assertEquals(THEME_EMOJI[theme].length > 0, true);
    }
  });

  await t.step("ai_gov has robot emoji", () => {
    assertEquals(THEME_EMOJI.ai_gov, "🤖");
  });

  await t.step("tax has money emoji", () => {
    assertEquals(THEME_EMOJI.tax, "💰");
  });

  await t.step("law has scales emoji", () => {
    assertEquals(THEME_EMOJI.law, "⚖️");
  });
});

Deno.test("message-utils - getThemeEmoji", async (t) => {
  await t.step("returns correct emoji for each theme", () => {
    assertEquals(getThemeEmoji("ai_gov"), "🤖");
    assertEquals(getThemeEmoji("tax"), "💰");
    assertEquals(getThemeEmoji("law"), "⚖️");
    assertEquals(getThemeEmoji("biz"), "📈");
    assertEquals(getThemeEmoji("career"), "👨‍⚕️");
    assertEquals(getThemeEmoji("asset"), "🏦");
    assertEquals(getThemeEmoji("general"), "💡");
  });

  await t.step("returns default emoji for unknown theme", () => {
    assertEquals(getThemeEmoji("unknown" as CardTheme), "💡");
  });
});

Deno.test("message-utils - formatMessage", async (t) => {
  await t.step("formats card with correct structure", () => {
    const card = createTestCard({ theme: "ai_gov", body: "テスト本文" });
    const message = formatMessage(card);

    assertEquals(message.startsWith("🤖 今日のひとこと"), true);
    assertEquals(message.includes("テスト本文"), true);
    assertEquals(message.includes("Cursorvers.edu"), true);
  });

  await t.step("uses correct emoji for each theme", () => {
    const themes: CardTheme[] = [
      "ai_gov",
      "tax",
      "law",
      "biz",
      "career",
      "asset",
      "general",
    ];

    for (const theme of themes) {
      const card = createTestCard({ theme, body: "Test" });
      const message = formatMessage(card);
      assertEquals(message.startsWith(THEME_EMOJI[theme]), true);
    }
  });

  await t.step("includes footer", () => {
    const card = createTestCard();
    const message = formatMessage(card);
    assertEquals(message.includes(MESSAGE_FOOTER), true);
  });

  await t.step("truncates long messages", () => {
    const longBody = "あ".repeat(5000);
    const card = createTestCard({ body: longBody });
    const message = formatMessage(card);

    assertEquals(message.length <= MAX_MESSAGE_LENGTH + 100, true);
    assertEquals(message.includes("..."), true);
  });

  await t.step("does not truncate short messages", () => {
    const shortBody = "短いメッセージ";
    const card = createTestCard({ body: shortBody });
    const message = formatMessage(card);

    assertEquals(message.includes("短いメッセージ"), true);
    // 末尾の省略記号がないことを確認（フッター前）
    const bodyPart = message.split("──────────")[0] ?? "";
    assertEquals(bodyPart.endsWith("...\n\n"), false);
  });
});

Deno.test("message-utils - generateBodyPreview", async (t) => {
  await t.step("returns full body if shorter than maxLength", () => {
    assertEquals(generateBodyPreview("短いテキスト", 50), "短いテキスト");
  });

  await t.step("truncates and adds ellipsis for long body", () => {
    const longText = "これは非常に長いテキストで50文字を超えています。";
    const preview = generateBodyPreview(longText, 20);

    assertEquals(preview.length, 23); // 20 + "..."
    assertEquals(preview.endsWith("..."), true);
  });

  await t.step("uses default maxLength of 50", () => {
    const text = "a".repeat(100);
    const preview = generateBodyPreview(text);

    assertEquals(preview.length, 53); // 50 + "..."
  });

  await t.step("handles exact boundary", () => {
    const text = "a".repeat(50);
    const preview = generateBodyPreview(text, 50);

    assertEquals(preview, text); // No truncation needed
  });
});

Deno.test("message-utils - isValidMessageLength", async (t) => {
  await t.step("returns true for short messages", () => {
    assertEquals(isValidMessageLength("Hello"), true);
    assertEquals(isValidMessageLength("a".repeat(1000)), true);
  });

  await t.step("returns true for messages at limit", () => {
    assertEquals(isValidMessageLength("a".repeat(5000)), true);
  });

  await t.step("returns false for messages over limit", () => {
    assertEquals(isValidMessageLength("a".repeat(5001)), false);
    assertEquals(isValidMessageLength("a".repeat(10000)), false);
  });

  await t.step("handles empty string", () => {
    assertEquals(isValidMessageLength(""), true);
  });
});

Deno.test("message-utils - constants", async (t) => {
  await t.step("MAX_MESSAGE_LENGTH is 4500", () => {
    assertEquals(MAX_MESSAGE_LENGTH, 4500);
  });

  await t.step("MESSAGE_FOOTER contains URL", () => {
    assertEquals(MESSAGE_FOOTER.includes("cursorvers.github.io"), true);
  });
});
