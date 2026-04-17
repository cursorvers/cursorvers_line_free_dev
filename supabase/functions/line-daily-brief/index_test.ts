import { assertEquals } from "std-assert";

Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
Deno.env.set("LINE_CHANNEL_ACCESS_TOKEN", "line-token-test");
Deno.env.set("LINE_DAILY_BRIEF_API_KEY", "daily-key-test");

const { handleLineDailyBriefRequest } = await import("./index.ts");

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function request(
  method: string,
  path: string,
  init: RequestInit = {},
): Request {
  return new Request(
    `https://example.com/functions/v1/line-daily-brief${path}`,
    {
      method,
      ...init,
    },
  );
}

Deno.test("line-daily-brief handler - authenticated GET health is side-effect free", async () => {
  const response = await handleLineDailyBriefRequest(
    request("GET", "?mode=health", {
      headers: { "X-API-Key": "daily-key-test" },
    }),
  );
  const body = await jsonBody(response);

  assertEquals(response.status, 200);
  assertEquals(body["status"], "healthy");
  assertEquals(body["health"], true);
  assertEquals(body["cardSent"], false);
});

Deno.test("line-daily-brief handler - legacy POST health body is side-effect free", async () => {
  const response = await handleLineDailyBriefRequest(
    request("POST", "", {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "daily-key-test",
      },
      body: JSON.stringify({ type: "health" }),
    }),
  );
  const body = await jsonBody(response);

  assertEquals(response.status, 200);
  assertEquals(body["status"], "healthy");
  assertEquals(body["cardSent"], false);
});

Deno.test("line-daily-brief handler - unauthenticated health is rejected", async () => {
  const response = await handleLineDailyBriefRequest(
    request("GET", "?mode=health"),
  );
  const body = await jsonBody(response);

  assertEquals(response.status, 401);
  assertEquals(body["error"], "Unauthorized");
});

Deno.test("line-daily-brief handler - plain GET never reaches broadcast path", async () => {
  const response = await handleLineDailyBriefRequest(
    request("GET", "", {
      headers: { "X-API-Key": "daily-key-test" },
    }),
  );
  const body = await jsonBody(response);

  assertEquals(response.status, 405);
  assertEquals(body["error"], "Method not allowed");
});
