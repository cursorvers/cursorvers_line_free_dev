/**
 * Discord API Endpoint Contract Tests
 *
 * Table-driven tests verifying:
 * - Correct URL construction for all endpoints
 * - Required parameter validation (empty/missing throws)
 * - Expected success status codes are defined
 *
 * @see Plans.md Phase 5-4
 */

import { assertEquals, assertThrows } from "std-assert";
import { DISCORD_ENDPOINTS } from "./discord-endpoints.ts";

const BASE = "https://discord.com/api/v10";

// ============================================
// URL Construction - Positive Cases
// ============================================

Deno.test("channelInvite - builds correct URL", () => {
  const url = DISCORD_ENDPOINTS.channelInvite.build("ch_123");
  assertEquals(url, `${BASE}/channels/ch_123/invites`);
});

Deno.test("memberRole - builds correct URL", () => {
  const url = DISCORD_ENDPOINTS.memberRole.build("g_123", "u_456", "r_789");
  assertEquals(url, `${BASE}/guilds/g_123/members/u_456/roles/r_789`);
});

Deno.test("memberRoleRemove - builds same URL as memberRole", () => {
  const url = DISCORD_ENDPOINTS.memberRoleRemove.build("g_1", "u_2", "r_3");
  assertEquals(url, `${BASE}/guilds/g_1/members/u_2/roles/r_3`);
});

Deno.test("dmChannel - builds correct URL (no params)", () => {
  const url = DISCORD_ENDPOINTS.dmChannel.build();
  assertEquals(url, `${BASE}/users/@me/channels`);
});

Deno.test("channelMessage - builds correct URL", () => {
  const url = DISCORD_ENDPOINTS.channelMessage.build("ch_456");
  assertEquals(url, `${BASE}/channels/ch_456/messages`);
});

// ============================================
// Required Parameter Validation
// ============================================

Deno.test("channelInvite - throws on empty channelId", () => {
  assertThrows(
    () => DISCORD_ENDPOINTS.channelInvite.build(""),
    Error,
    "channelId",
  );
});

Deno.test("memberRole - throws on empty guildId", () => {
  assertThrows(
    () => DISCORD_ENDPOINTS.memberRole.build("", "u_1", "r_1"),
    Error,
    "guildId",
  );
});

Deno.test("memberRole - throws on empty userId", () => {
  assertThrows(
    () => DISCORD_ENDPOINTS.memberRole.build("g_1", "", "r_1"),
    Error,
    "userId",
  );
});

Deno.test("memberRole - throws on empty roleId", () => {
  assertThrows(
    () => DISCORD_ENDPOINTS.memberRole.build("g_1", "u_1", ""),
    Error,
    "roleId",
  );
});

Deno.test("channelMessage - throws on empty channelId", () => {
  assertThrows(
    () => DISCORD_ENDPOINTS.channelMessage.build(""),
    Error,
    "channelId",
  );
});

// ============================================
// Contract: Success Status Codes
// ============================================

Deno.test("all endpoints have okStatuses defined", () => {
  for (const [name, spec] of Object.entries(DISCORD_ENDPOINTS)) {
    assertEquals(
      spec.okStatuses.length > 0,
      true,
      `${name} must have at least one okStatus`,
    );
  }
});

Deno.test("channelInvite - expects 200 or 201", () => {
  assertEquals(DISCORD_ENDPOINTS.channelInvite.okStatuses.includes(200), true);
  assertEquals(DISCORD_ENDPOINTS.channelInvite.okStatuses.includes(201), true);
});

Deno.test("memberRole - expects 204 (No Content)", () => {
  assertEquals(DISCORD_ENDPOINTS.memberRole.okStatuses.includes(204), true);
});

Deno.test("memberRoleRemove - expects 204 or 404 (already removed)", () => {
  assertEquals(DISCORD_ENDPOINTS.memberRoleRemove.okStatuses.includes(204), true);
  assertEquals(DISCORD_ENDPOINTS.memberRoleRemove.okStatuses.includes(404), true);
});

Deno.test("dmChannel - expects 200", () => {
  assertEquals(DISCORD_ENDPOINTS.dmChannel.okStatuses.includes(200), true);
});

Deno.test("channelMessage - expects 200", () => {
  assertEquals(DISCORD_ENDPOINTS.channelMessage.okStatuses.includes(200), true);
});

// ============================================
// Contract: HTTP Methods
// ============================================

Deno.test("channelInvite method is POST", () => {
  assertEquals(DISCORD_ENDPOINTS.channelInvite.method, "POST");
});

Deno.test("memberRole method is PUT", () => {
  assertEquals(DISCORD_ENDPOINTS.memberRole.method, "PUT");
});

Deno.test("memberRoleRemove method is DELETE", () => {
  assertEquals(DISCORD_ENDPOINTS.memberRoleRemove.method, "DELETE");
});

Deno.test("dmChannel method is POST", () => {
  assertEquals(DISCORD_ENDPOINTS.dmChannel.method, "POST");
});

Deno.test("channelMessage method is POST", () => {
  assertEquals(DISCORD_ENDPOINTS.channelMessage.method, "POST");
});

// ============================================
// Table-Driven: All endpoints have descriptions
// ============================================

Deno.test("all endpoints have description", () => {
  for (const [name, spec] of Object.entries(DISCORD_ENDPOINTS)) {
    assertEquals(
      typeof spec.description === "string" && spec.description.length > 0,
      true,
      `${name} must have a description`,
    );
  }
});
