/**
 * Identity Resolver - Safe account merge/linking decisions
 *
 * Replaces the unsafe "merge oldest orphan" pattern with
 * evidence-based identity resolution.
 *
 * Rules:
 * - Strong evidence (same line_user_id in Checkout metadata) → auto-merge
 * - Weak evidence (email=null oldest record) → hold for admin review
 * - All merge operations are logged for audit
 *
 * @see Plans.md Phase 5-2
 */

import { createLogger } from "./logger.ts";
import { maskEmail } from "./masking-utils.ts";

const log = createLogger("identity-resolver");

// ============================================
// Types
// ============================================

export interface OrphanCandidate {
  readonly id: string;
  readonly line_user_id: string | null;
  readonly email: string | null;
  readonly tier: string | null;
  readonly created_at?: string;
}

export type MergeEvidence =
  | "CHECKOUT_METADATA"
  | "SAME_LINE_USER_ID"
  | "WEAK_EMAIL_NULL";

export interface MergeDecision {
  readonly action: "AUTO_MERGE" | "HOLD_FOR_REVIEW" | "NO_CANDIDATES";
  readonly evidence: MergeEvidence | null;
  readonly candidate: OrphanCandidate | null;
  readonly reason: string;
}

export interface AuditEntry {
  readonly timestamp: string;
  readonly action: MergeDecision["action"];
  readonly evidence: MergeEvidence | null;
  readonly paidMemberId: string;
  readonly paidEmail: string;
  readonly candidateId: string | null;
  readonly candidateLineUserId: string | null;
}

// ============================================
// Core Logic
// ============================================

/**
 * Decide whether to merge an orphan LINE record into a paid member.
 *
 * @param paidMemberId - The paid member's ID
 * @param paidEmail - The paid member's email
 * @param metadataLineUserId - line_user_id from Stripe Checkout metadata (strong evidence)
 * @param orphanCandidates - Orphan records found in the database
 */
export function decideMerge(
  paidMemberId: string,
  paidEmail: string,
  metadataLineUserId: string | null,
  orphanCandidates: readonly OrphanCandidate[],
): MergeDecision {
  // Case 1: Checkout metadata has line_user_id → strong evidence
  if (metadataLineUserId) {
    const match = orphanCandidates.find(
      (c) => c.line_user_id === metadataLineUserId,
    );
    if (match) {
      log.info("Identity resolved via checkout metadata", {
        paidMemberId,
        paidEmail: maskEmail(paidEmail),
        candidateId: match.id,
        evidence: "CHECKOUT_METADATA",
      });
      return {
        action: "AUTO_MERGE",
        evidence: "CHECKOUT_METADATA",
        candidate: match,
        reason: "Checkout metadata line_user_id matches orphan record",
      };
    }
  }

  // Case 2: Paid member already has line_user_id matching an orphan → strong evidence
  // (This case is handled by the caller checking paidMember.line_user_id)

  // Case 3: Only weak evidence (email=null orphans) → hold for review
  const weakCandidates = orphanCandidates.filter(
    (c) => c.email === null && c.line_user_id !== null,
  );
  if (weakCandidates.length > 0) {
    log.warn(
      "Orphan candidates found but only weak evidence - holding for review",
      {
        paidMemberId,
        paidEmail: maskEmail(paidEmail),
        candidateCount: weakCandidates.length,
        candidateIds: weakCandidates.map((c) => c.id),
      },
    );
    return {
      action: "HOLD_FOR_REVIEW",
      evidence: "WEAK_EMAIL_NULL",
      candidate: weakCandidates[0],
      reason:
        `${weakCandidates.length} orphan(s) found but no causal link to paid member. Admin review required.`,
    };
  }

  // Case 4: No candidates
  return {
    action: "NO_CANDIDATES",
    evidence: null,
    candidate: null,
    reason: "No orphan records found",
  };
}

/**
 * Create an audit log entry for a merge decision.
 */
export function createAuditEntry(
  decision: MergeDecision,
  paidMemberId: string,
  paidEmail: string,
): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    action: decision.action,
    evidence: decision.evidence,
    paidMemberId,
    paidEmail: maskEmail(paidEmail) ?? paidEmail,
    candidateId: decision.candidate?.id ?? null,
    candidateLineUserId: decision.candidate?.line_user_id ?? null,
  };
}
