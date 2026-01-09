/**
 * discord-bot validation-utils テスト
 */
import { assertEquals, assertExists, assertThrows } from "std-assert";
import {
  EMAIL_REGEX,
  hexToUint8Array,
  INTERACTION_TYPE,
  isValidEmail,
  normalizeEmail,
  RESPONSE_TYPE,
  splitMessage,
} from "./validation-utils.ts";

Deno.test("validation-utils - isValidEmail", async (t) => {
  await t.step("returns true for valid emails", () => {
    assertEquals(isValidEmail("test@example.com"), true);
    assertEquals(isValidEmail("user.name@domain.co.jp"), true);
    assertEquals(isValidEmail("user+tag@gmail.com"), true);
    assertEquals(isValidEmail("a@b.co"), true);
  });

  await t.step("returns false for invalid emails", () => {
    assertEquals(isValidEmail(""), false);
    assertEquals(isValidEmail("notanemail"), false);
    assertEquals(isValidEmail("missing@domain"), false);
    assertEquals(isValidEmail("@nodomain.com"), false);
    assertEquals(isValidEmail("spaces in@email.com"), false);
  });

  await t.step("returns false for null/undefined", () => {
    assertEquals(isValidEmail(null as unknown as string), false);
    assertEquals(isValidEmail(undefined as unknown as string), false);
  });

  await t.step("handles whitespace", () => {
    assertEquals(isValidEmail("  test@example.com  "), true);
  });
});

Deno.test("validation-utils - normalizeEmail", async (t) => {
  await t.step("trims and lowercases string emails", () => {
    assertEquals(normalizeEmail("  Test@Example.COM  "), "test@example.com");
    assertEquals(normalizeEmail("USER@DOMAIN.CO.JP"), "user@domain.co.jp");
  });

  await t.step("handles number input", () => {
    assertEquals(normalizeEmail(12345), "12345");
  });

  await t.step("returns empty string for invalid input", () => {
    assertEquals(normalizeEmail(null), "");
    assertEquals(normalizeEmail(undefined), "");
    assertEquals(normalizeEmail({}), "");
    assertEquals(normalizeEmail([]), "");
  });
});

Deno.test("validation-utils - splitMessage", async (t) => {
  await t.step("returns single chunk for short messages", () => {
    const result = splitMessage("Hello, World!");
    assertEquals(result.length, 1);
    assertEquals(result[0], "Hello, World!");
  });

  await t.step("splits long messages at newlines", () => {
    const text = "Line 1\n".repeat(500);
    const result = splitMessage(text, 100);

    for (const chunk of result) {
      assertEquals(chunk.length <= 100, true);
    }
  });

  await t.step("splits at spaces when no newlines", () => {
    const text = "word ".repeat(500);
    const result = splitMessage(text, 100);

    for (const chunk of result) {
      assertEquals(chunk.length <= 100, true);
    }
  });

  await t.step("force splits when no good break point", () => {
    const text = "a".repeat(300);
    const result = splitMessage(text, 100);

    assertEquals(result.length, 3);
    const [first, second, third] = result;
    assertExists(first);
    assertExists(second);
    assertExists(third);
    assertEquals(first.length, 100);
    assertEquals(second.length, 100);
    assertEquals(third.length, 100);
  });

  await t.step("handles empty string", () => {
    const result = splitMessage("");
    assertEquals(result.length, 0);
  });

  await t.step("uses default maxLength of 2000", () => {
    const text = "a".repeat(4000);
    const result = splitMessage(text);

    assertEquals(result.length, 2);
    const [first, second] = result;
    assertExists(first);
    assertExists(second);
    assertEquals(first.length, 2000);
    assertEquals(second.length, 2000);
  });
});

Deno.test("validation-utils - hexToUint8Array", async (t) => {
  await t.step("converts hex string to Uint8Array", () => {
    const result = hexToUint8Array("48656c6c6f");
    assertEquals(result, new Uint8Array([72, 101, 108, 108, 111]));
  });

  await t.step("handles uppercase hex", () => {
    const result = hexToUint8Array("AABBCC");
    assertEquals(result, new Uint8Array([170, 187, 204]));
  });

  await t.step("handles mixed case", () => {
    const result = hexToUint8Array("aAbBcC");
    assertEquals(result, new Uint8Array([170, 187, 204]));
  });

  await t.step("throws for invalid hex string", () => {
    assertThrows(() => hexToUint8Array(""));
  });

  await t.step("handles single byte", () => {
    const result = hexToUint8Array("ff");
    assertEquals(result, new Uint8Array([255]));
  });
});

Deno.test("validation-utils - INTERACTION_TYPE constants", async (t) => {
  await t.step("has correct values", () => {
    assertEquals(INTERACTION_TYPE.PING, 1);
    assertEquals(INTERACTION_TYPE.APPLICATION_COMMAND, 2);
    assertEquals(INTERACTION_TYPE.MESSAGE_COMPONENT, 3);
    assertEquals(INTERACTION_TYPE.APPLICATION_COMMAND_AUTOCOMPLETE, 4);
    assertEquals(INTERACTION_TYPE.MODAL_SUBMIT, 5);
  });
});

Deno.test("validation-utils - RESPONSE_TYPE constants", async (t) => {
  await t.step("has correct values", () => {
    assertEquals(RESPONSE_TYPE.PONG, 1);
    assertEquals(RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE, 4);
    assertEquals(RESPONSE_TYPE.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, 5);
    assertEquals(RESPONSE_TYPE.DEFERRED_UPDATE_MESSAGE, 6);
    assertEquals(RESPONSE_TYPE.UPDATE_MESSAGE, 7);
  });
});

Deno.test("validation-utils - EMAIL_REGEX", async (t) => {
  await t.step("is a valid RegExp", () => {
    assertEquals(EMAIL_REGEX instanceof RegExp, true);
  });

  await t.step("matches valid emails", () => {
    assertEquals(EMAIL_REGEX.test("a@b.c"), true);
    assertEquals(EMAIL_REGEX.test("test@example.com"), true);
  });

  await t.step("does not match invalid emails", () => {
    assertEquals(EMAIL_REGEX.test("invalid"), false);
    assertEquals(EMAIL_REGEX.test("@missing.com"), false);
  });
});
