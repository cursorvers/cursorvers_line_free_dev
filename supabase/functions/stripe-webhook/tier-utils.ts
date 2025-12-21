/**
 * Stripe Webhook のメンバーシップ tier 判定ユーティリティ
 */

// Master Class の最低金額（38万円 = 380000円）
export const MASTER_CLASS_MIN_AMOUNT = 380000;

// Master Class の Payment Link ID パターン
export const MASTER_CLASS_PAYMENT_LINK_PATTERN = "5kQaEXavbc9T63SfB34F201";

/**
 * 決済金額からメンバーシップ tier を判定
 * @param amountTotal 決済金額（最小通貨単位、円）
 * @returns "master" | "library"
 */
export function determineTierByAmount(amountTotal: number | null): string {
  if (amountTotal && amountTotal >= MASTER_CLASS_MIN_AMOUNT) {
    return "master";
  }
  return "library";
}

/**
 * Payment Link ID からメンバーシップ tier を判定
 * @param paymentLinkId Stripe Payment Link ID
 * @returns "master" | "library"
 */
export function determineTierByPaymentLink(
  paymentLinkId: string | null,
): string {
  if (
    paymentLinkId &&
    paymentLinkId.includes(MASTER_CLASS_PAYMENT_LINK_PATTERN)
  ) {
    return "master";
  }
  return "library";
}

/**
 * 金額と Payment Link ID の両方から tier を判定
 * どちらかが Master Class 条件を満たせば "master" を返す
 */
export function determineMembershipTier(
  amountTotal: number | null,
  paymentLinkId: string | null,
): string {
  if (determineTierByAmount(amountTotal) === "master") {
    return "master";
  }
  if (determineTierByPaymentLink(paymentLinkId) === "master") {
    return "master";
  }
  return "library";
}

/**
 * サブスクリプションステータスからメンバーステータスを判定
 */
export function determineStatus(
  subscriptionStatus: string,
): "active" | "inactive" {
  return subscriptionStatus === "canceled" ? "inactive" : "active";
}
