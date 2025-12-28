/**
 * create-checkout-session ユーティリティテスト
 * Note: CORS/response helpers moved to _shared/http-utils.ts and tested there
 */
import { assertEquals } from "std-assert";
import { isValidEmail, validateCheckoutRequest } from "./utils.ts";

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
