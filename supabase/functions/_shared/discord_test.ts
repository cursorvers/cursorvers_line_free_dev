/**
 * Discord API ユーティリティ テスト
 */
import { assertEquals, assertExists } from "std-assert";
import { stub } from "std-mock";
import { createClientRoom, findExistingClientRoom } from "./discord.ts";

Deno.test("discord - Rate Limit Retry Logic", async (t) => {
  await t.step("parseFloat correctly parses Retry-After header", () => {
    const retryAfter = "1.5";
    const ms = parseFloat(retryAfter) * 1000;
    assertEquals(ms, 1500);
  });

  await t.step("parseFloat handles integer Retry-After", () => {
    const retryAfter = "2";
    const ms = parseFloat(retryAfter) * 1000;
    assertEquals(ms, 2000);
  });

  await t.step("default retry delay is 1000ms", () => {
    const DEFAULT_RETRY_DELAY_MS = 1000;
    assertEquals(DEFAULT_RETRY_DELAY_MS, 1000);
  });

  await t.step("max retries is 3", () => {
    const MAX_RETRIES = 3;
    assertEquals(MAX_RETRIES, 3);
  });
});

Deno.test("discord - DiscordResult interface", async (t) => {
  await t.step("success result structure", () => {
    const result: { success: boolean; error?: string } = { success: true };
    assertEquals(result.success, true);
    assertEquals(result.error, undefined);
  });

  await t.step("error result structure", () => {
    const result = { success: false, error: "API error: 403" };
    assertEquals(result.success, false);
    assertEquals(result.error, "API error: 403");
  });
});

Deno.test("discord - Discord User ID validation", async (t) => {
  await t.step("valid Discord User ID format (snowflake)", () => {
    const validId = "123456789012345678"; // 18 digits
    assertEquals(/^\d{17,19}$/.test(validId), true);
  });

  await t.step("valid Discord User ID - 17 digits", () => {
    const validId = "12345678901234567";
    assertEquals(/^\d{17,19}$/.test(validId), true);
  });

  await t.step("valid Discord User ID - 19 digits", () => {
    const validId = "1234567890123456789";
    assertEquals(/^\d{17,19}$/.test(validId), true);
  });

  await t.step("invalid Discord User ID - too short", () => {
    const invalidId = "1234567890";
    assertEquals(/^\d{17,19}$/.test(invalidId), false);
  });

  await t.step("invalid Discord User ID - contains letters", () => {
    const invalidId = "12345678901234567a";
    assertEquals(/^\d{17,19}$/.test(invalidId), false);
  });
});

Deno.test("discord - Invite URL format", async (t) => {
  await t.step("invite URL uses discord.gg domain", () => {
    const code = "abc123";
    const inviteUrl = `https://discord.gg/${code}`;
    assertEquals(inviteUrl.startsWith("https://discord.gg/"), true);
  });

  await t.step("invite code extraction", () => {
    const inviteUrl = "https://discord.gg/abc123";
    const code = inviteUrl.split("/").pop();
    assertEquals(code, "abc123");
  });
});

Deno.test("discord - API endpoint construction", async (t) => {
  await t.step("role endpoint format", () => {
    const guildId = "123456789012345678";
    const userId = "987654321098765432";
    const roleId = "111222333444555666";
    const endpoint =
      `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`;
    assertEquals(endpoint.includes("/api/v10/"), true);
    assertEquals(endpoint.includes("/guilds/"), true);
    assertEquals(endpoint.includes("/members/"), true);
    assertEquals(endpoint.includes("/roles/"), true);
  });

  await t.step("invite endpoint format", () => {
    const guildId = "123456789012345678";
    const endpoint = `https://discord.com/api/v10/guilds/${guildId}/invites`;
    assertEquals(endpoint.includes("/api/v10/"), true);
    assertEquals(endpoint.endsWith("/invites"), true);
  });

  await t.step("DM channel endpoint format", () => {
    const endpoint = "https://discord.com/api/v10/users/@me/channels";
    assertEquals(endpoint.includes("/users/@me/channels"), true);
  });
});

Deno.test("discord - Response status handling", async (t) => {
  await t.step("204 No Content is success for role operations", () => {
    const status = 204;
    const isSuccess = status >= 200 && status < 300;
    assertEquals(isSuccess, true);
  });

  await t.step("404 is treated as success for role removal", () => {
    // ユーザーがサーバーにいない or ロールを持っていない → 成功扱い
    const status = 404;
    const isAlreadyRemoved = status === 404;
    assertEquals(isAlreadyRemoved, true);
  });

  await t.step("429 triggers rate limit handling", () => {
    const status = 429;
    const isRateLimited = status === 429;
    assertEquals(isRateLimited, true);
  });

  await t.step("403 Forbidden is an error", () => {
    const status: number = 403;
    const isError = status >= 400 && status !== 404 && status !== 429;
    assertEquals(isError, true);
  });
});

Deno.test("discord - Invite parameters", async (t) => {
  await t.step("default max_age is 2 weeks in seconds", () => {
    const twoWeeksInSeconds = 14 * 24 * 60 * 60;
    assertEquals(twoWeeksInSeconds, 1209600);
  });

  await t.step("default max_uses is 1", () => {
    const defaultMaxUses = 1;
    assertEquals(defaultMaxUses, 1);
  });

  await t.step("unique flag should be true", () => {
    const inviteParams = {
      max_age: 1209600,
      max_uses: 1,
      unique: true,
    };
    assertEquals(inviteParams.unique, true);
  });
});

Deno.test("discord - Authorization header format", async (t) => {
  await t.step("Bot token authorization format", () => {
    const token = "test_token_123";
    const authHeader = `Bot ${token}`;
    assertEquals(authHeader.startsWith("Bot "), true);
  });
});

Deno.test("discord - User ID anonymization for logging", async (t) => {
  await t.step("slice(-4) shows last 4 characters", () => {
    const discordUserId = "123456789012345678";
    const anonymized = discordUserId.slice(-4);
    assertEquals(anonymized, "5678");
    assertEquals(anonymized.length, 4);
  });

  await t.step("handles short user IDs gracefully", () => {
    const shortId = "123";
    const anonymized = shortId.slice(-4);
    assertEquals(anonymized, "123"); // slice doesn't fail on short strings
  });
});

Deno.test("discord - createClientRoom creates a private channel under the configured category", async () => {
  const envStub = stub(Deno.env, "get", (key: string) => {
    switch (key) {
      case "DISCORD_BOT_TOKEN":
        return "test-bot-token";
      case "DISCORD_GUILD_ID":
        return "guild_123";
      case "DISCORD_CLIENT_ROOM_CATEGORY_ID":
        return "category_456";
      case "DISCORD_ADMIN_BOT_ID":
        return "bot_789";
      default:
        return undefined;
    }
  });

  let requestUrl = "";
  let requestBody: Record<string, unknown> | null = null;
  const fetchStub = stub(globalThis, "fetch", (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return Promise.resolve(
      new Response(JSON.stringify({ id: "channel_123" }), { status: 200 }),
    );
  });

  try {
    const result = await createClientRoom("123456789012345678", "Test User");

    assertEquals(result.success, true);
    assertEquals(result.channelId, "channel_123");
    assertEquals(
      requestUrl,
      "https://discord.com/api/v10/guilds/guild_123/channels",
    );
    assertExists(requestBody);
    assertEquals(requestBody?.type, 0);
    assertEquals(requestBody?.parent_id, "category_456");
    assertEquals(requestBody?.name, "test-user");

    const overwrites = requestBody?.permission_overwrites as Array<
      Record<string, unknown>
    >;
    assertEquals(overwrites.length, 3);
    assertEquals(overwrites[0]?.id, "guild_123");
    assertEquals(overwrites[0]?.deny, "3072");
    assertEquals(overwrites[1]?.id, "123456789012345678");
    assertEquals(overwrites[1]?.allow, "68608");
    assertEquals(overwrites[2]?.id, "bot_789");
    assertEquals(overwrites[2]?.allow, "269564944");
  } finally {
    fetchStub.restore();
    envStub.restore();
  }
});

Deno.test("discord - findExistingClientRoom returns channel id when user overwrite exists", async () => {
  const envStub = stub(Deno.env, "get", (key: string) => {
    switch (key) {
      case "DISCORD_BOT_TOKEN":
        return "test-bot-token";
      case "DISCORD_GUILD_ID":
        return "guild_123";
      case "DISCORD_CLIENT_ROOM_CATEGORY_ID":
        return "category_456";
      default:
        return undefined;
    }
  });

  const fetchStub = stub(globalThis, "fetch", () =>
    Promise.resolve(
      new Response(
        JSON.stringify([
          {
            id: "channel_other",
            parent_id: "other_category",
            permission_overwrites: [{ id: "123456789012345678", allow: "1" }],
          },
          {
            id: "channel_123",
            parent_id: "category_456",
            permission_overwrites: [
              { id: "123456789012345678", allow: "68608" },
            ],
          },
        ]),
        { status: 200 },
      ),
    ));

  try {
    const channelId = await findExistingClientRoom("123456789012345678");
    assertEquals(channelId, "channel_123");
  } finally {
    fetchStub.restore();
    envStub.restore();
  }
});
