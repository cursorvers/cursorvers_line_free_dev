/**
 * http-utils.ts テスト
 */
import { assertEquals } from "std-assert";
import {
  addCorsHeaders,
  errorResponse,
  extractBearerToken,
  isJsonContentType,
  isRetryableStatus,
  isSuccessStatus,
  isValidHttpMethod,
  jsonResponse,
  parseQueryParams,
} from "./http-utils.ts";

Deno.test("http-utils - addCorsHeaders", async (t) => {
  await t.step("adds CORS headers with allowed origin", () => {
    const headers = new Headers();
    addCorsHeaders(headers, "https://cursorvers.com");

    assertEquals(
      headers.get("Access-Control-Allow-Origin"),
      "https://cursorvers.com",
    );
    assertEquals(
      headers.get("Access-Control-Allow-Methods"),
      "GET, POST, OPTIONS",
    );
    assertEquals(
      headers.get("Access-Control-Allow-Headers"),
      "Content-Type, Authorization, X-API-Key, x-client-info, apikey",
    );
  });

  await t.step("uses first allowed origin for unknown origins", () => {
    const headers = new Headers();
    addCorsHeaders(headers, "https://unknown-origin.com");

    // Should return first allowed origin when request origin is not in allowed list
    assertEquals(
      headers.get("Access-Control-Allow-Origin"),
      "https://cursorvers.com",
    );
  });

  await t.step("preserves existing headers", () => {
    const headers = new Headers({ "X-Custom": "value" });
    addCorsHeaders(headers, "https://cursorvers.com");

    assertEquals(headers.get("X-Custom"), "value");
    assertEquals(
      headers.get("Access-Control-Allow-Origin"),
      "https://cursorvers.com",
    );
  });
});

Deno.test("http-utils - jsonResponse", async (t) => {
  await t.step("creates JSON response with default status", async () => {
    const response = jsonResponse({ message: "Hello" });

    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Content-Type"), "application/json");

    const body = await response.json();
    assertEquals(body.message, "Hello");
  });

  await t.step("creates JSON response with custom status", () => {
    const response = jsonResponse({ error: "Not found" }, 404);

    assertEquals(response.status, 404);
  });

  await t.step("accepts custom headers", () => {
    const response = jsonResponse({ data: "test" }, 200, {
      "X-Custom": "header",
    });

    assertEquals(response.headers.get("X-Custom"), "header");
    assertEquals(response.headers.get("Content-Type"), "application/json");
  });

  await t.step("serializes arrays", async () => {
    const response = jsonResponse([1, 2, 3]);
    const body = await response.json();

    assertEquals(body, [1, 2, 3]);
  });
});

Deno.test("http-utils - errorResponse", async (t) => {
  await t.step("creates error response with default status", async () => {
    const response = errorResponse("Something went wrong");

    assertEquals(response.status, 500);
    const body = await response.json();
    assertEquals(body.error, "Something went wrong");
  });

  await t.step("creates error response with custom status", () => {
    const response = errorResponse("Bad request", 400);

    assertEquals(response.status, 400);
  });
});

Deno.test("http-utils - extractBearerToken", async (t) => {
  await t.step("extracts token from valid header", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer token123" },
    });

    assertEquals(extractBearerToken(request), "token123");
  });

  await t.step("handles lowercase bearer", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "bearer token456" },
    });

    assertEquals(extractBearerToken(request), "token456");
  });

  await t.step("returns null for missing header", () => {
    const request = new Request("https://example.com");

    assertEquals(extractBearerToken(request), null);
  });

  await t.step("returns null for non-bearer auth", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });

    assertEquals(extractBearerToken(request), null);
  });

  await t.step("handles token with special characters", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer abc.def.ghi_123-456" },
    });

    assertEquals(extractBearerToken(request), "abc.def.ghi_123-456");
  });
});

Deno.test("http-utils - parseQueryParams", async (t) => {
  await t.step("parses query parameters", () => {
    const url = new URL("https://example.com?foo=bar&baz=qux");
    const params = parseQueryParams(url);

    assertEquals(params["foo"], "bar");
    assertEquals(params["baz"], "qux");
  });

  await t.step("handles empty query string", () => {
    const url = new URL("https://example.com");
    const params = parseQueryParams(url);

    assertEquals(Object.keys(params).length, 0);
  });

  await t.step("handles encoded values", () => {
    const url = new URL("https://example.com?name=%E3%83%86%E3%82%B9%E3%83%88");
    const params = parseQueryParams(url);

    assertEquals(params["name"], "テスト");
  });
});

Deno.test("http-utils - isValidHttpMethod", async (t) => {
  await t.step("returns true for allowed methods", () => {
    assertEquals(isValidHttpMethod("GET", ["GET", "POST"]), true);
    assertEquals(isValidHttpMethod("POST", ["GET", "POST"]), true);
  });

  await t.step("returns false for disallowed methods", () => {
    assertEquals(isValidHttpMethod("DELETE", ["GET", "POST"]), false);
    assertEquals(isValidHttpMethod("PUT", ["GET", "POST"]), false);
  });

  await t.step("handles case insensitivity", () => {
    assertEquals(isValidHttpMethod("get", ["GET", "POST"]), true);
    assertEquals(isValidHttpMethod("Post", ["GET", "POST"]), true);
  });
});

Deno.test("http-utils - isJsonContentType", async (t) => {
  await t.step("returns true for application/json", () => {
    const request = new Request("https://example.com", {
      headers: { "Content-Type": "application/json" },
    });

    assertEquals(isJsonContentType(request), true);
  });

  await t.step("returns true with charset", () => {
    const request = new Request("https://example.com", {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

    assertEquals(isJsonContentType(request), true);
  });

  await t.step("returns false for other content types", () => {
    const request = new Request("https://example.com", {
      headers: { "Content-Type": "text/html" },
    });

    assertEquals(isJsonContentType(request), false);
  });

  await t.step("returns false for missing header", () => {
    const request = new Request("https://example.com");

    assertEquals(isJsonContentType(request), false);
  });
});

Deno.test("http-utils - isRetryableStatus", async (t) => {
  await t.step("returns true for retryable statuses", () => {
    assertEquals(isRetryableStatus(429), true);
    assertEquals(isRetryableStatus(500), true);
    assertEquals(isRetryableStatus(502), true);
    assertEquals(isRetryableStatus(503), true);
    assertEquals(isRetryableStatus(504), true);
  });

  await t.step("returns false for non-retryable statuses", () => {
    assertEquals(isRetryableStatus(200), false);
    assertEquals(isRetryableStatus(400), false);
    assertEquals(isRetryableStatus(401), false);
    assertEquals(isRetryableStatus(404), false);
  });
});

Deno.test("http-utils - isSuccessStatus", async (t) => {
  await t.step("returns true for 2xx statuses", () => {
    assertEquals(isSuccessStatus(200), true);
    assertEquals(isSuccessStatus(201), true);
    assertEquals(isSuccessStatus(204), true);
    assertEquals(isSuccessStatus(299), true);
  });

  await t.step("returns false for non-2xx statuses", () => {
    assertEquals(isSuccessStatus(100), false);
    assertEquals(isSuccessStatus(199), false);
    assertEquals(isSuccessStatus(300), false);
    assertEquals(isSuccessStatus(400), false);
    assertEquals(isSuccessStatus(500), false);
  });
});
