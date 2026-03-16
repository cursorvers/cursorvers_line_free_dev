/**
 * Policy Engine - Authorization decision single point of truth
 *
 * All authorization decisions (Discord access, role assignment, etc.)
 * MUST go through this module. Direct status/tier checks in handlers
 * are prohibited.
 *
 * @see Plans.md Phase 5-1
 */

import { createLogger } from "./logger.ts";

const log = createLogger("policy");

// ============================================
// Types
// ============================================

/** Member record from the database (subset of fields needed for policy) */
export interface PolicyMember {
  readonly id: string;
  readonly email?: string | null;
  readonly tier?: string | null;
  readonly status?: string | null;
  readonly stripe_customer_id?: string | null;
  readonly stripe_subscription_id?: string | null;
  readonly discord_user_id?: string | null;
  readonly line_user_id?: string | null;
}

/** Policy decision result */
export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly code: PolicyDenyCode | "ALLOWED";
}

/** Denial reason codes for structured error handling */
export type PolicyDenyCode =
  | "NO_PAID_TIER"
  | "INACTIVE_SUBSCRIPTION"
  | "NO_MEMBER_RECORD"
  | "ALREADY_HAS_ROLE"
  | "INVALID_GUILD";

// ============================================
// Constants (Decision Table)
// ============================================

/** Tiers that grant Discord access */
const PAID_TIERS = ["library", "master"] as const;

/** Statuses that indicate an active subscription */
const ACTIVE_STATUSES = ["active", "trialing"] as const;

// ============================================
// Policy Functions
// ============================================

/**
 * Determine if a member can access Discord (receive invite / get role).
 *
 * Decision Table:
 * | tier      | status   | result  |
 * |-----------|----------|---------|
 * | library   | active   | ALLOW   |
 * | library   | trialing | ALLOW   |
 * | master    | active   | ALLOW   |
 * | master    | trialing | ALLOW   |
 * | free      | *        | DENY    |
 * | null      | *        | DENY    |
 * | *         | inactive | DENY    |
 * | *         | canceled | DENY    |
 */
export function canAccessDiscord(
  member: PolicyMember | null,
): PolicyDecision {
  if (!member) {
    return {
      allowed: false,
      reason: "会員レコードが見つかりません",
      code: "NO_MEMBER_RECORD",
    };
  }

  const tier = member.tier ?? "free";
  const status = member.status ?? "free";

  // Check tier first (primary condition)
  const hasPaidTier = (PAID_TIERS as readonly string[]).includes(tier);
  if (!hasPaidTier) {
    log.info("Discord access denied: no paid tier", {
      memberId: member.id,
      tier,
    });
    return {
      allowed: false,
      reason: "有料プランへの加入が必要です",
      code: "NO_PAID_TIER",
    };
  }

  // Check status (secondary condition)
  const hasActiveStatus = (ACTIVE_STATUSES as readonly string[]).includes(
    status,
  );
  if (!hasActiveStatus) {
    log.info("Discord access denied: inactive subscription", {
      memberId: member.id,
      tier,
      status,
    });
    return {
      allowed: false,
      reason: "サブスクリプションが有効ではありません",
      code: "INACTIVE_SUBSCRIPTION",
    };
  }

  return {
    allowed: true,
    reason: "Discord access granted",
    code: "ALLOWED",
  };
}

/**
 * Determine the correct member status for a registration event.
 * Prevents the "free user with active status" bug.
 *
 * Rule: status follows tier. Free users get "free" status.
 * Only Stripe-confirmed paid members get "active"/"trialing".
 */
export function determineRegistrationStatus(
  existingStatus: string | null | undefined,
  tier: string | null | undefined,
): string {
  const resolvedTier = tier ?? "free";
  const hasPaidTier = (PAID_TIERS as readonly string[]).includes(resolvedTier);

  if (hasPaidTier) {
    // Paid members keep their existing status (set by Stripe webhook)
    return existingStatus ?? "active";
  }

  // Free members always get "free" status
  return "free";
}

/**
 * Validate that a Discord command is from the expected guild.
 */
export function isValidGuild(
  guildId: string | undefined,
  expectedGuildId: string,
): boolean {
  if (!expectedGuildId) {
    // If no expected guild is configured, allow (graceful degradation)
    log.warn("DISCORD_GUILD_ID not configured, skipping guild validation");
    return true;
  }
  return guildId === expectedGuildId;
}

/**
 * User-friendly error message for a policy denial.
 * Maps PolicyDenyCode to a message suitable for Discord/LINE display.
 */
export function getDenyMessage(decision: PolicyDecision): string {
  switch (decision.code) {
    case "NO_PAID_TIER":
      return "⛔ 有料プランへの加入が必要です。Stripeで決済後、再度お試しください。";
    case "INACTIVE_SUBSCRIPTION":
      return "⛔ サブスクリプションが有効ではありません。お支払い状況をご確認ください。";
    case "NO_MEMBER_RECORD":
      return "⛔ 決済情報が見つかりません。Stripeで決済したメールアドレスを正確に入力してください。";
    case "ALREADY_HAS_ROLE":
      return "✅ すでにDiscordロールが付与されています。";
    case "INVALID_GUILD":
      return "⛔ このサーバーではコマンドを使用できません。";
    default:
      return "⛔ アクセスが拒否されました。";
  }
}
