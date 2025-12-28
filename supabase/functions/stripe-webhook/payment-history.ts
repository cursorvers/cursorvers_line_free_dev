/**
 * 支払い履歴保存モジュール
 * Stripeの決済イベントをpayment_historyテーブルに記録
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createLogger } from "../_shared/logger.ts";
import { extractErrorMessage } from "../_shared/error-utils.ts";

const log = createLogger("payment-history");

// 支払い履歴レコードの型定義
export interface PaymentHistoryRecord {
  id: string;
  customer_id: string | null;
  email: string | null;
  member_id?: string | null;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  tier: string | null;
  payment_method_type: string | null;
  failure_code: string | null;
  failure_message: string | null;
  refunded_amount: number;
  receipt_url: string | null;
  stripe_created: number | null;
}

/**
 * checkout.session.completed から支払い履歴を保存
 */
export async function savePaymentFromCheckout(
  // deno-lint-ignore no-explicit-any
  supabase: ReturnType<typeof createClient<any>>,
  session: Stripe.Checkout.Session,
  tier: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const record: PaymentHistoryRecord = {
      id: session.payment_intent as string || `session_${session.id}`,
      customer_id: session.customer as string | null,
      email: session.customer_details?.email || null,
      amount: session.amount_total || 0,
      currency: session.currency || "jpy",
      status: session.payment_status === "paid" ? "succeeded" : session.payment_status || "unknown",
      description: getTierDescription(tier),
      tier,
      payment_method_type: null, // checkout sessionからは取得困難
      failure_code: null,
      failure_message: null,
      refunded_amount: 0,
      receipt_url: null,
      stripe_created: session.created,
    };

    // member_idを取得
    if (record.email) {
      const { data: member } = await supabase
        .from("members")
        .select("id")
        .eq("email", record.email)
        .maybeSingle();

      if (member?.id) {
        record.member_id = member.id;
      }
    }

    // upsert（重複時は更新）
    const { error } = await supabase
      .from("payment_history")
      .upsert(record, { onConflict: "id" });

    if (error) {
      log.error("Failed to save payment history from checkout", {
        error: error.message,
        sessionId: session.id,
      });
      return { success: false, error: error.message };
    }

    log.info("Payment history saved from checkout", {
      paymentId: record.id,
      email: record.email?.slice(0, 5) + "***",
      amount: record.amount,
      tier,
    });

    return { success: true };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Exception saving payment history", { errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * charge イベントから支払い履歴を保存
 */
export async function savePaymentFromCharge(
  // deno-lint-ignore no-explicit-any
  supabase: ReturnType<typeof createClient<any>>,
  charge: Stripe.Charge,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 顧客情報からemailとtierを取得
    let email: string | null = charge.billing_details?.email || null;
    let tier: string | null = null;
    let memberId: string | null = null;

    if (charge.customer && typeof charge.customer === "string") {
      const { data: member } = await supabase
        .from("members")
        .select("id, email, tier")
        .eq("stripe_customer_id", charge.customer)
        .maybeSingle();

      if (member) {
        email = member.email || email;
        tier = member.tier;
        memberId = member.id;
      }
    }

    // emailで再検索（customer_idがない場合）
    if (!memberId && email) {
      const { data: member } = await supabase
        .from("members")
        .select("id, tier")
        .eq("email", email)
        .maybeSingle();

      if (member) {
        tier = member.tier;
        memberId = member.id;
      }
    }

    const record: PaymentHistoryRecord = {
      id: charge.id,
      customer_id: charge.customer as string | null,
      email,
      member_id: memberId,
      amount: charge.amount,
      currency: charge.currency,
      status: mapChargeStatus(charge),
      description: charge.description || getTierDescription(tier),
      tier,
      payment_method_type: charge.payment_method_details?.type || null,
      failure_code: charge.failure_code || null,
      failure_message: charge.failure_message || null,
      refunded_amount: charge.amount_refunded || 0,
      receipt_url: charge.receipt_url || null,
      stripe_created: charge.created,
    };

    // upsert
    const { error } = await supabase
      .from("payment_history")
      .upsert(record, { onConflict: "id" });

    if (error) {
      log.error("Failed to save payment history from charge", {
        error: error.message,
        chargeId: charge.id,
      });
      return { success: false, error: error.message };
    }

    log.info("Payment history saved from charge", {
      chargeId: charge.id,
      status: record.status,
      amount: record.amount,
    });

    return { success: true };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Exception saving payment history from charge", { errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Chargeのステータスをマッピング
 */
function mapChargeStatus(charge: Stripe.Charge): string {
  if (charge.refunded) return "refunded";
  if (charge.disputed) return "disputed";
  if (charge.status === "succeeded") return "succeeded";
  if (charge.status === "failed") return "failed";
  if (charge.status === "pending") return "pending";
  return charge.status || "unknown";
}

/**
 * tierから商品説明を生成
 */
function getTierDescription(tier: string | null): string {
  switch (tier) {
    case "master":
      return "Master Class メンバーシップ";
    case "library":
      return "Library Member メンバーシップ";
    default:
      return "メンバーシップ";
  }
}
