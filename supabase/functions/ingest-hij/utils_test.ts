/**
 * ingest-hij ユーティリティテスト
 */
import { assertEquals } from "std-assert";
import { extractTLP, validatePayload } from "./utils.ts";

Deno.test("ingest-hij - extractTLP", async (t) => {
  await t.step("extracts TLP:GREEN", () => {
    const text = "This is a TLP:GREEN message";
    assertEquals(extractTLP(text), "GREEN");
  });

  await t.step("extracts TLP:AMBER", () => {
    const text = "Confidential - TLP:AMBER";
    assertEquals(extractTLP(text), "AMBER");
  });

  await t.step("extracts TLP:RED", () => {
    const text = "Top Secret TLP:RED information";
    assertEquals(extractTLP(text), "RED");
  });

  await t.step("extracts TLP:CLEAR", () => {
    const text = "Public notice TLP:CLEAR for distribution";
    assertEquals(extractTLP(text), "CLEAR");
  });

  await t.step("handles lowercase tlp", () => {
    const text = "This is tlp:green classified";
    assertEquals(extractTLP(text), "GREEN");
  });

  await t.step("handles mixed case", () => {
    const text = "TLP:Green message";
    assertEquals(extractTLP(text), "GREEN");
  });

  await t.step("handles space after colon", () => {
    const text = "TLP: GREEN with space";
    assertEquals(extractTLP(text), "GREEN");
  });

  await t.step("returns null for no TLP", () => {
    const text = "Regular message without any TLP marking";
    assertEquals(extractTLP(text), null);
  });

  await t.step("returns null for empty string", () => {
    assertEquals(extractTLP(""), null);
  });

  await t.step("returns null for invalid TLP value", () => {
    const text = "TLP:BLUE is not valid";
    assertEquals(extractTLP(text), null);
  });

  await t.step("extracts first TLP if multiple present", () => {
    const text = "TLP:GREEN then TLP:RED later";
    assertEquals(extractTLP(text), "GREEN");
  });

  await t.step("handles Japanese text with TLP", () => {
    const text = "セキュリティ警告 TLP:AMBER 取り扱い注意";
    assertEquals(extractTLP(text), "AMBER");
  });
});

Deno.test("ingest-hij - validatePayload", async (t) => {
  await t.step("returns valid for complete payload", () => {
    const payload = {
      message_id: "msg-123",
      sent_at: "2025-12-21T10:00:00Z",
      subject: "Test Subject",
      body: "Test body content",
    };
    const result = validatePayload(payload);
    assertEquals(result.valid, true);
    assertEquals(result.error, undefined);
  });

  await t.step("returns error for missing message_id", () => {
    const payload = {
      sent_at: "2025-12-21T10:00:00Z",
      subject: "Test Subject",
      body: "Test body content",
    };
    const result = validatePayload(payload);
    assertEquals(result.valid, false);
    assertEquals(result.error, "message_id is required");
  });

  await t.step("returns error for missing sent_at", () => {
    const payload = {
      message_id: "msg-123",
      subject: "Test Subject",
      body: "Test body content",
    };
    const result = validatePayload(payload);
    assertEquals(result.valid, false);
    assertEquals(result.error, "sent_at is required");
  });

  await t.step("returns error for missing body", () => {
    const payload = {
      message_id: "msg-123",
      sent_at: "2025-12-21T10:00:00Z",
      subject: "Test Subject",
    };
    const result = validatePayload(payload);
    assertEquals(result.valid, false);
    assertEquals(result.error, "body is required");
  });

  await t.step("valid without subject (optional field)", () => {
    const payload = {
      message_id: "msg-123",
      sent_at: "2025-12-21T10:00:00Z",
      body: "Test body content",
    };
    const result = validatePayload(payload);
    assertEquals(result.valid, true);
  });

  await t.step("returns error for empty message_id", () => {
    const payload = {
      message_id: "",
      sent_at: "2025-12-21T10:00:00Z",
      body: "Test body content",
    };
    const result = validatePayload(payload);
    assertEquals(result.valid, false);
  });

  await t.step("returns error for empty body", () => {
    const payload = {
      message_id: "msg-123",
      sent_at: "2025-12-21T10:00:00Z",
      body: "",
    };
    const result = validatePayload(payload);
    assertEquals(result.valid, false);
  });
});
