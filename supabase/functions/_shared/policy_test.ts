/**
 * Policy Engine - Decision Table Tests
 *
 * Tests all combinations of tier x status for canAccessDiscord.
 * Ensures free users can never get Discord access regardless of status.
 */

import { assertEquals } from "std-assert";
import {
  canAccessDiscord,
  determineRegistrationStatus,
  getDenyMessage,
  isValidGuild,
} from "./policy.ts";
import type { PolicyMember } from "./policy.ts";

// ============================================
// Helper
// ============================================

function makeMember(
  overrides: Partial<PolicyMember> = {},
): PolicyMember {
  return {
    id: "test-id",
    email: "test@example.com",
    tier: "library",
    status: "active",
    stripe_customer_id: "cus_test",
    stripe_subscription_id: "sub_test",
    discord_user_id: null,
    line_user_id: null,
    ...overrides,
  };
}

// ============================================
// canAccessDiscord - Decision Table
// ============================================

Deno.test("canAccessDiscord - paid active member is allowed", () => {
  const result = canAccessDiscord(
    makeMember({ tier: "library", status: "active" }),
  );
  assertEquals(result.allowed, true);
  assertEquals(result.code, "ALLOWED");
});

Deno.test("canAccessDiscord - paid trialing member is allowed", () => {
  const result = canAccessDiscord(
    makeMember({ tier: "library", status: "trialing" }),
  );
  assertEquals(result.allowed, true);
  assertEquals(result.code, "ALLOWED");
});

Deno.test("canAccessDiscord - master active member is allowed", () => {
  const result = canAccessDiscord(
    makeMember({ tier: "master", status: "active" }),
  );
  assertEquals(result.allowed, true);
  assertEquals(result.code, "ALLOWED");
});

Deno.test("canAccessDiscord - master trialing member is allowed", () => {
  const result = canAccessDiscord(
    makeMember({ tier: "master", status: "trialing" }),
  );
  assertEquals(result.allowed, true);
  assertEquals(result.code, "ALLOWED");
});

// --- CRITICAL: Free users must NEVER get access ---

Deno.test("canAccessDiscord - free active member is DENIED (privilege escalation prevention)", () => {
  const result = canAccessDiscord(
    makeMember({ tier: "free", status: "active" }),
  );
  assertEquals(result.allowed, false);
  assertEquals(result.code, "NO_PAID_TIER");
});

Deno.test("canAccessDiscord - free trialing member is DENIED", () => {
  const result = canAccessDiscord(
    makeMember({ tier: "free", status: "trialing" }),
  );
  assertEquals(result.allowed, false);
  assertEquals(result.code, "NO_PAID_TIER");
});

Deno.test("canAccessDiscord - free inactive member is DENIED", () => {
  const result = canAccessDiscord(
    makeMember({ tier: "free", status: "inactive" }),
  );
  assertEquals(result.allowed, false);
  assertEquals(result.code, "NO_PAID_TIER");
});

Deno.test("canAccessDiscord - null tier is DENIED", () => {
  const result = canAccessDiscord(makeMember({ tier: null, status: "active" }));
  assertEquals(result.allowed, false);
  assertEquals(result.code, "NO_PAID_TIER");
});

// --- Inactive paid members ---

Deno.test("canAccessDiscord - library inactive is DENIED", () => {
  const result = canAccessDiscord(
    makeMember({ tier: "library", status: "inactive" }),
  );
  assertEquals(result.allowed, false);
  assertEquals(result.code, "INACTIVE_SUBSCRIPTION");
});

Deno.test("canAccessDiscord - library canceled is DENIED", () => {
  const result = canAccessDiscord(
    makeMember({ tier: "library", status: "canceled" }),
  );
  assertEquals(result.allowed, false);
  assertEquals(result.code, "INACTIVE_SUBSCRIPTION");
});

// --- Null member ---

Deno.test("canAccessDiscord - null member is DENIED", () => {
  const result = canAccessDiscord(null);
  assertEquals(result.allowed, false);
  assertEquals(result.code, "NO_MEMBER_RECORD");
});

// ============================================
// determineRegistrationStatus
// ============================================

Deno.test("determineRegistrationStatus - free user gets 'free' status", () => {
  assertEquals(determineRegistrationStatus(null, "free"), "free");
});

Deno.test("determineRegistrationStatus - null tier gets 'free' status", () => {
  assertEquals(determineRegistrationStatus(null, null), "free");
});

Deno.test("determineRegistrationStatus - free user with existing 'active' gets 'free'", () => {
  // This is the bug prevention test: even if existing status was "active",
  // free users must get "free" status
  assertEquals(determineRegistrationStatus("active", "free"), "free");
});

Deno.test("determineRegistrationStatus - paid user keeps existing status", () => {
  assertEquals(determineRegistrationStatus("active", "library"), "active");
  assertEquals(determineRegistrationStatus("trialing", "master"), "trialing");
});

Deno.test("determineRegistrationStatus - new paid user defaults to 'active'", () => {
  assertEquals(determineRegistrationStatus(null, "library"), "active");
});

// ============================================
// isValidGuild
// ============================================

Deno.test("isValidGuild - matching guild is valid", () => {
  assertEquals(isValidGuild("guild123", "guild123"), true);
});

Deno.test("isValidGuild - mismatched guild is invalid", () => {
  assertEquals(isValidGuild("guild999", "guild123"), false);
});

Deno.test("isValidGuild - empty expected guild allows all (graceful degradation)", () => {
  assertEquals(isValidGuild("guild999", ""), true);
});

// ============================================
// getDenyMessage
// ============================================

Deno.test("getDenyMessage - NO_PAID_TIER returns upgrade message", () => {
  const msg = getDenyMessage({
    allowed: false,
    reason: "",
    code: "NO_PAID_TIER",
  });
  assertEquals(msg.includes("有料プラン"), true);
});

Deno.test("getDenyMessage - INACTIVE_SUBSCRIPTION returns reactivation message", () => {
  const msg = getDenyMessage({
    allowed: false,
    reason: "",
    code: "INACTIVE_SUBSCRIPTION",
  });
  assertEquals(msg.includes("サブスクリプション"), true);
});
