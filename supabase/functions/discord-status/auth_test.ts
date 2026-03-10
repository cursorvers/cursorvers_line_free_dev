import {
  discordStatusUnauthorizedResponse,
  verifyDiscordStatusAuth,
} from "./auth.ts";
import { assertEquals } from "std-assert";

Deno.test("verifyDiscordStatusAuth accepts x-admin-secret", () => {
  const req = new Request("https://example.com/functions/v1/discord-status", {
    headers: { "x-admin-secret": "secret-1" },
  });
  assertEquals(
    verifyDiscordStatusAuth(req, { adminSecret: "secret-1" }),
    true,
  );
});

Deno.test("verifyDiscordStatusAuth rejects bearer token", () => {
  const req = new Request("https://example.com/functions/v1/discord-status", {
    headers: { Authorization: "Bearer service-role" },
  });
  assertEquals(
    verifyDiscordStatusAuth(req, { adminSecret: "secret-1" }),
    false,
  );
});

Deno.test("verifyDiscordStatusAuth rejects apikey", () => {
  const req = new Request("https://example.com/functions/v1/discord-status", {
    headers: { apikey: "service-role" },
  });
  assertEquals(
    verifyDiscordStatusAuth(req, { adminSecret: "secret-1" }),
    false,
  );
});

Deno.test("verifyDiscordStatusAuth rejects missing credentials", () => {
  const req = new Request("https://example.com/functions/v1/discord-status");
  assertEquals(
    verifyDiscordStatusAuth(req, { adminSecret: "secret-1" }),
    false,
  );
});

Deno.test("discordStatusUnauthorizedResponse returns 401 json", async () => {
  const res = discordStatusUnauthorizedResponse();
  assertEquals(res.status, 401);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  assertEquals(await res.text(), JSON.stringify({ error: "Unauthorized" }));
});
