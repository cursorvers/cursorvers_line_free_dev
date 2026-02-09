/**
 * Identity Resolver Tests
 *
 * Verifies merge decisions are safe:
 * - Strong evidence → auto-merge
 * - Weak evidence → hold for review (NEVER auto-merge)
 * - No candidates → no action
 */

import { assertEquals } from "std-assert";
import { createAuditEntry, decideMerge } from "./identity-resolver.ts";
import type { OrphanCandidate } from "./identity-resolver.ts";

// ============================================
// Helper
// ============================================

const orphanWithLineId: OrphanCandidate = {
  id: "orphan-1",
  line_user_id: "U_LINE_123",
  email: null,
  tier: "free",
};

const orphanWithDifferentLineId: OrphanCandidate = {
  id: "orphan-2",
  line_user_id: "U_LINE_999",
  email: null,
  tier: "free",
};

// ============================================
// Strong evidence: Checkout metadata match
// ============================================

Deno.test("decideMerge - checkout metadata matches orphan → AUTO_MERGE", () => {
  const result = decideMerge(
    "paid-1",
    "paid@test.com",
    "U_LINE_123", // metadata line_user_id
    [orphanWithLineId],
  );
  assertEquals(result.action, "AUTO_MERGE");
  assertEquals(result.evidence, "CHECKOUT_METADATA");
  assertEquals(result.candidate?.id, "orphan-1");
});

Deno.test("decideMerge - checkout metadata does NOT match any orphan → HOLD_FOR_REVIEW", () => {
  const result = decideMerge(
    "paid-1",
    "paid@test.com",
    "U_LINE_UNKNOWN", // no match
    [orphanWithLineId],
  );
  assertEquals(result.action, "HOLD_FOR_REVIEW");
  assertEquals(result.evidence, "WEAK_EMAIL_NULL");
});

// ============================================
// Weak evidence: email=null orphans only
// ============================================

Deno.test("decideMerge - no metadata, orphans exist → HOLD_FOR_REVIEW (never auto-merge)", () => {
  const result = decideMerge(
    "paid-1",
    "paid@test.com",
    null, // no metadata
    [orphanWithLineId, orphanWithDifferentLineId],
  );
  assertEquals(result.action, "HOLD_FOR_REVIEW");
  assertEquals(result.evidence, "WEAK_EMAIL_NULL");
  assertEquals(result.reason.includes("Admin review required"), true);
});

Deno.test("decideMerge - weak evidence reports candidate count", () => {
  const result = decideMerge(
    "paid-1",
    "paid@test.com",
    null,
    [orphanWithLineId, orphanWithDifferentLineId],
  );
  assertEquals(result.reason.includes("2 orphan(s)"), true);
});

// ============================================
// No candidates
// ============================================

Deno.test("decideMerge - no orphan candidates → NO_CANDIDATES", () => {
  const result = decideMerge("paid-1", "paid@test.com", null, []);
  assertEquals(result.action, "NO_CANDIDATES");
  assertEquals(result.candidate, null);
});

Deno.test("decideMerge - orphan with email (not null) is excluded from weak candidates", () => {
  const orphanWithEmail: OrphanCandidate = {
    id: "orphan-3",
    line_user_id: "U_LINE_456",
    email: "someone@test.com", // has email → not a weak candidate
    tier: "free",
  };
  const result = decideMerge("paid-1", "paid@test.com", null, [
    orphanWithEmail,
  ]);
  assertEquals(result.action, "NO_CANDIDATES");
});

// ============================================
// Audit entry
// ============================================

Deno.test("createAuditEntry - captures all fields", () => {
  const decision = decideMerge("paid-1", "paid@test.com", "U_LINE_123", [
    orphanWithLineId,
  ]);
  const entry = createAuditEntry(decision, "paid-1", "paid@test.com");

  assertEquals(entry.action, "AUTO_MERGE");
  assertEquals(entry.evidence, "CHECKOUT_METADATA");
  assertEquals(entry.paidMemberId, "paid-1");
  assertEquals(entry.candidateId, "orphan-1");
  assertEquals(typeof entry.timestamp, "string");
});

Deno.test("createAuditEntry - masks email in audit", () => {
  const decision = decideMerge("paid-1", "paid@test.com", null, []);
  const entry = createAuditEntry(decision, "paid-1", "paid@test.com");

  // maskEmail should truncate/mask the email
  assertEquals(
    entry.paidEmail !== "paid@test.com" || entry.paidEmail.includes("*"),
    true,
  );
});
