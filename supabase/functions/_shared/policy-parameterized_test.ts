/**
 * Policy Engine - Parameterized Decision Table Tests (Phase 6)
 *
 * Exhaustive tier x status x subscription_status combinations.
 * Ensures no privilege escalation is possible in ANY combination.
 */

import { assertEquals } from "std-assert";
import { canAccessDiscord } from "./policy.ts";
import type { PolicyMember } from "./policy.ts";

// ============================================
// Decision Table: All Combinations
// ============================================

const TIERS = ["free", "library", "master", null] as const;
const STATUSES = [
  "free",
  "active",
  "trialing",
  "inactive",
  "canceled",
  null,
] as const;

interface TestCase {
  readonly tier: string | null;
  readonly status: string | null;
  readonly expectedAllowed: boolean;
  readonly expectedCode: string;
}

// Build exhaustive decision table
const DECISION_TABLE: TestCase[] = [];

for (const tier of TIERS) {
  for (const status of STATUSES) {
    const isPaidTier = tier === "library" || tier === "master";
    const isActiveStatus = status === "active" || status === "trialing";

    let expectedAllowed: boolean;
    let expectedCode: string;

    if (!isPaidTier) {
      expectedAllowed = false;
      expectedCode = "NO_PAID_TIER";
    } else if (!isActiveStatus) {
      expectedAllowed = false;
      expectedCode = "INACTIVE_SUBSCRIPTION";
    } else {
      expectedAllowed = true;
      expectedCode = "ALLOWED";
    }

    DECISION_TABLE.push({ tier, status, expectedAllowed, expectedCode });
  }
}

// ============================================
// Parameterized Tests
// ============================================

Deno.test("canAccessDiscord - exhaustive decision table (tier x status)", async (t) => {
  for (
    const { tier, status, expectedAllowed, expectedCode } of DECISION_TABLE
  ) {
    const label = `tier=${tier ?? "null"}, status=${status ?? "null"} → ${
      expectedAllowed ? "ALLOW" : "DENY"
    }`;
    await t.step(label, () => {
      const member: PolicyMember = {
        id: "test-id",
        email: "test@example.com",
        tier,
        status,
        stripe_customer_id: "cus_test",
        stripe_subscription_id: "sub_test",
        discord_user_id: null,
        line_user_id: null,
      };

      const result = canAccessDiscord(member);
      assertEquals(
        result.allowed,
        expectedAllowed,
        `${label}: allowed mismatch`,
      );
      assertEquals(result.code, expectedCode, `${label}: code mismatch`);
    });
  }
});

// ============================================
// CRITICAL: Privilege Escalation Prevention
// ============================================

Deno.test("CRITICAL - free tier NEVER gets Discord access regardless of status", async (t) => {
  for (const status of STATUSES) {
    await t.step(`free + ${status ?? "null"} → DENY`, () => {
      const member: PolicyMember = {
        id: "escalation-test",
        email: "free@test.com",
        tier: "free",
        status,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        discord_user_id: null,
        line_user_id: null,
      };
      const result = canAccessDiscord(member);
      assertEquals(result.allowed, false);
      assertEquals(result.code, "NO_PAID_TIER");
    });
  }
});

Deno.test("CRITICAL - null tier NEVER gets Discord access regardless of status", async (t) => {
  for (const status of STATUSES) {
    await t.step(`null + ${status ?? "null"} → DENY`, () => {
      const member: PolicyMember = {
        id: "null-tier-test",
        email: "null@test.com",
        tier: null,
        status,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        discord_user_id: null,
        line_user_id: null,
      };
      const result = canAccessDiscord(member);
      assertEquals(result.allowed, false);
      assertEquals(result.code, "NO_PAID_TIER");
    });
  }
});
