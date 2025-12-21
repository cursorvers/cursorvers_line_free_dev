/**
 * google-sheets-utils.ts テスト
 */
import { assertEquals } from "std-assert";
import {
  base64Decode,
  base64Encode,
  buildCellRange,
  cleanPemString,
  columnToNumber,
  isValidSpreadsheetId,
  numberToColumn,
  sanitizeTabName,
} from "./google-sheets-utils.ts";

Deno.test("google-sheets-utils - cleanPemString", async (t) => {
  await t.step("removes PEM headers and footers", () => {
    const pem =
      "-----BEGIN PRIVATE KEY-----\nYWJjZGVm\n-----END PRIVATE KEY-----";
    assertEquals(cleanPemString(pem), "YWJjZGVm");
  });

  await t.step("removes whitespace", () => {
    const pem = "YWJj\n ZGVm\t \n";
    assertEquals(cleanPemString(pem), "YWJjZGVm");
  });

  await t.step("handles empty string", () => {
    assertEquals(cleanPemString(""), "");
  });
});

Deno.test("google-sheets-utils - base64Decode/Encode", async (t) => {
  await t.step("encodes bytes to base64", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    assertEquals(base64Encode(bytes), "SGVsbG8=");
  });

  await t.step("decodes base64 to bytes", () => {
    const result = base64Decode("SGVsbG8=");
    assertEquals(result, new Uint8Array([72, 101, 108, 108, 111]));
  });

  await t.step("round-trip encode/decode", () => {
    const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
    const encoded = base64Encode(original);
    const decoded = base64Decode(encoded);
    assertEquals(decoded, original);
  });
});

Deno.test("google-sheets-utils - isValidSpreadsheetId", async (t) => {
  await t.step("returns true for valid IDs", () => {
    assertEquals(
      isValidSpreadsheetId("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"),
      true,
    );
    assertEquals(
      isValidSpreadsheetId("abc123_-DEFghijklmnopqrstuvwxyz012"),
      true,
    );
  });

  await t.step("returns false for too short IDs", () => {
    assertEquals(isValidSpreadsheetId("short"), false);
  });

  await t.step("returns false for invalid characters", () => {
    assertEquals(isValidSpreadsheetId("abc!@#$%^&*()def"), false);
  });

  await t.step("returns false for empty/null", () => {
    assertEquals(isValidSpreadsheetId(""), false);
    assertEquals(isValidSpreadsheetId(null as unknown as string), false);
  });
});

Deno.test("google-sheets-utils - sanitizeTabName", async (t) => {
  await t.step("keeps valid names unchanged", () => {
    assertEquals(sanitizeTabName("Sheet1"), "Sheet1");
    assertEquals(sanitizeTabName("データ_2025"), "データ_2025");
  });

  await t.step("replaces invalid characters with underscore", () => {
    assertEquals(sanitizeTabName("Sheet[1]"), "Sheet_1_");
    assertEquals(sanitizeTabName("Data*?/Test"), "Data___Test");
    assertEquals(sanitizeTabName("Tab\\Name"), "Tab_Name");
    assertEquals(sanitizeTabName("Tab'Name"), "Tab_Name");
  });

  await t.step("truncates long names to 100 chars", () => {
    const longName = "a".repeat(150);
    assertEquals(sanitizeTabName(longName).length, 100);
  });

  await t.step("handles empty string", () => {
    assertEquals(sanitizeTabName(""), "");
  });
});

Deno.test("google-sheets-utils - buildCellRange", async (t) => {
  await t.step("builds simple range", () => {
    assertEquals(buildCellRange("Sheet1", "A", 1), "Sheet1!A1");
  });

  await t.step("builds range with end column", () => {
    assertEquals(buildCellRange("Sheet1", "A", 2, "Z"), "Sheet1!A2:Z");
  });

  await t.step("builds full range", () => {
    assertEquals(buildCellRange("Data", "B", 2, "D", 100), "Data!B2:D100");
  });

  await t.step("sanitizes tab name in range", () => {
    assertEquals(buildCellRange("Sheet[1]", "A", 1), "Sheet_1_!A1");
  });
});

Deno.test("google-sheets-utils - columnToNumber", async (t) => {
  await t.step("converts single letters", () => {
    assertEquals(columnToNumber("A"), 1);
    assertEquals(columnToNumber("B"), 2);
    assertEquals(columnToNumber("Z"), 26);
  });

  await t.step("converts double letters", () => {
    assertEquals(columnToNumber("AA"), 27);
    assertEquals(columnToNumber("AB"), 28);
    assertEquals(columnToNumber("AZ"), 52);
    assertEquals(columnToNumber("BA"), 53);
  });

  await t.step("converts triple letters", () => {
    assertEquals(columnToNumber("AAA"), 703);
  });
});

Deno.test("google-sheets-utils - numberToColumn", async (t) => {
  await t.step("converts to single letters", () => {
    assertEquals(numberToColumn(1), "A");
    assertEquals(numberToColumn(2), "B");
    assertEquals(numberToColumn(26), "Z");
  });

  await t.step("converts to double letters", () => {
    assertEquals(numberToColumn(27), "AA");
    assertEquals(numberToColumn(28), "AB");
    assertEquals(numberToColumn(52), "AZ");
    assertEquals(numberToColumn(53), "BA");
  });

  await t.step("round-trip conversion", () => {
    for (let i = 1; i <= 100; i++) {
      assertEquals(columnToNumber(numberToColumn(i)), i);
    }
  });
});
