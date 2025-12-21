/**
 * create-checkout-session ユーティリティテスト
 */
import { assertEquals } from "std-assert";
import {
  corsHeaders,
  createErrorResponse,
  createSuccessResponse,
  isValidEmail,
  validateCheckoutRequest,
} from "./utils.ts";

Deno.test("create-checkout-session - isValidEmail", async (t) => {
  await t.step("accepts valid email", () => {
    assertEquals(isValidEmail("test@example.com"), true);
  });

  await t.step("accepts email with subdomain", () => {
    assertEquals(isValidEmail("test@mail.example.com"), true);
  });

  await t.step("accepts email with plus sign", () => {
    assertEquals(isValidEmail("test+tag@example.com"), true);
  });

  await t.step("accepts email with dots in local part", () => {
    assertEquals(isValidEmail("first.last@example.com"), true);
  });

  await t.step("accepts Japanese domain", () => {
    assertEquals(isValidEmail("test@example.co.jp"), true);
  });

  await t.step("rejects email without @", () => {
    assertEquals(isValidEmail("testexample.com"), false);
  });

  await t.step("rejects email without domain", () => {
    assertEquals(isValidEmail("test@"), false);
  });

  await t.step("rejects email without local part", () => {
    assertEquals(isValidEmail("@example.com"), false);
  });

  await t.step("rejects email with spaces", () => {
    assertEquals(isValidEmail("test @example.com"), false);
  });

  await t.step("rejects empty string", () => {
    assertEquals(isValidEmail(""), false);
  });
});

Deno.test("create-checkout-session - validateCheckoutRequest", async (t) => {
  await t.step("returns valid for complete request", () => {
    const result = validateCheckoutRequest("test@example.com", true);
    assertEquals(result.valid, true);
    assertEquals(result.error, undefined);
  });

  await t.step("returns error for missing email", () => {
    const result = validateCheckoutRequest(undefined, true);
    assertEquals(result.valid, false);
    assertEquals(result.error, "Email is required");
  });

  await t.step("returns error for empty email", () => {
    const result = validateCheckoutRequest("", true);
    assertEquals(result.valid, false);
    assertEquals(result.error, "Email is required");
  });

  await t.step("returns error for invalid email format", () => {
    const result = validateCheckoutRequest("invalid-email", true);
    assertEquals(result.valid, false);
    assertEquals(result.error, "Invalid email format");
  });

  await t.step("returns error for missing terms agreement", () => {
    const result = validateCheckoutRequest("test@example.com", false);
    assertEquals(result.valid, false);
    assertEquals(result.error, "Terms agreement is required");
  });

  await t.step("returns error for undefined terms", () => {
    const result = validateCheckoutRequest("test@example.com", undefined);
    assertEquals(result.valid, false);
    assertEquals(result.error, "Terms agreement is required");
  });
});

Deno.test("create-checkout-session - corsHeaders", async (t) => {
  await t.step("has Access-Control-Allow-Origin", () => {
    assertEquals(corsHeaders["Access-Control-Allow-Origin"], "*");
  });

  await t.step("has Access-Control-Allow-Headers", () => {
    assertEquals(typeof corsHeaders["Access-Control-Allow-Headers"], "string");
    assertEquals(
      corsHeaders["Access-Control-Allow-Headers"].includes("content-type"),
      true,
    );
  });
});

Deno.test("create-checkout-session - createErrorResponse", async (t) => {
  await t.step("returns Response with error message", async () => {
    const response = createErrorResponse("Test error");
    const body = await response.json();
    assertEquals(body.error, "Test error");
  });

  await t.step("uses default status 400", () => {
    const response = createErrorResponse("Test error");
    assertEquals(response.status, 400);
  });

  await t.step("uses custom status", () => {
    const response = createErrorResponse("Server error", 500);
    assertEquals(response.status, 500);
  });

  await t.step("includes CORS headers", () => {
    const response = createErrorResponse("Test error");
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  });

  await t.step("has JSON content type", () => {
    const response = createErrorResponse("Test error");
    assertEquals(response.headers.get("Content-Type"), "application/json");
  });
});

Deno.test("create-checkout-session - createSuccessResponse", async (t) => {
  await t.step("returns Response with data", async () => {
    const response = createSuccessResponse({ url: "https://stripe.com" });
    const body = await response.json();
    assertEquals(body.url, "https://stripe.com");
  });

  await t.step("uses default status 200", () => {
    const response = createSuccessResponse({ success: true });
    assertEquals(response.status, 200);
  });

  await t.step("uses custom status", () => {
    const response = createSuccessResponse({ created: true }, 201);
    assertEquals(response.status, 201);
  });

  await t.step("includes CORS headers", () => {
    const response = createSuccessResponse({});
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  });

  await t.step("has JSON content type", () => {
    const response = createSuccessResponse({});
    assertEquals(response.headers.get("Content-Type"), "application/json");
  });
});
