/**
 * 支払い履歴取得モジュール
 * LINE Botから支払い履歴を照会する機能
 */
import { createClient } from "@supabase/supabase-js";
import { createLogger } from "../../_shared/logger.ts";
import { extractErrorMessage } from "../../_shared/error-utils.ts";

const log = createLogger("payment-history-line");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  : null;

// 支払い履歴レコードの型
interface PaymentHistoryItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  tier: string | null;
  created_at: string;
  stripe_created: number | null;
}

// 支払い履歴取得結果
export interface PaymentHistoryResult {
  success: boolean;
  payments: PaymentHistoryItem[];
  totalPaid: number;
  message?: string;
  error?: string;
}

/**
 * LINE User ID から支払い履歴を取得
 */
export async function getPaymentHistoryByLineUserId(
  lineUserId: string,
  limit = 5,
): Promise<PaymentHistoryResult> {
  if (!supabase) {
    log.error("Supabase configuration missing for payment history");
    return {
      success: false,
      payments: [],
      totalPaid: 0,
      error: "Supabase configuration missing",
    };
  }
  try {
    // まずmembersテーブルからmember_idを取得
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, email, tier")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    if (memberError) {
      log.error("Failed to fetch member", { error: memberError.message });
      return {
        success: false,
        payments: [],
        totalPaid: 0,
        error: memberError.message,
      };
    }

    if (!member) {
      log.info("No member found for LINE user", {
        lineUserId: lineUserId.slice(0, 8) + "...",
      });
      return {
        success: true,
        payments: [],
        totalPaid: 0,
        message:
          "会員情報が見つかりません。有料プランにご登録後、お支払い履歴が表示されます。",
      };
    }

    // payment_historyテーブルから履歴を取得
    const { data: payments, error: paymentError } = await supabase
      .from("payment_history")
      .select(
        "id, amount, currency, status, description, tier, created_at, stripe_created",
      )
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (paymentError) {
      log.error("Failed to fetch payment history", {
        error: paymentError.message,
      });
      return {
        success: false,
        payments: [],
        totalPaid: 0,
        error: paymentError.message,
      };
    }

    // 合計支払い額を計算
    const totalPaid = (payments || [])
      .filter((p) => p.status === "succeeded")
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    log.info("Payment history fetched", {
      memberId: member.id,
      count: payments?.length || 0,
      totalPaid,
    });

    return {
      success: true,
      payments: payments || [],
      totalPaid,
    };
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Exception fetching payment history", { errorMessage });
    return { success: false, payments: [], totalPaid: 0, error: errorMessage };
  }
}

/**
 * 支払い履歴をLINEメッセージ用にフォーマット
 */
export function formatPaymentHistoryMessage(
  result: PaymentHistoryResult,
): string {
  if (!result.success) {
    return [
      "❌ 支払い履歴の取得に失敗しました",
      "",
      "しばらくしてから再度お試しください。",
    ].join("\n");
  }

  if (result.message) {
    return result.message;
  }

  if (result.payments.length === 0) {
    return [
      "📋 支払い履歴",
      "",
      "まだお支払い履歴がありません。",
      "",
      "有料プランにご登録いただくと、",
      "こちらで履歴を確認できます。",
    ].join("\n");
  }

  const lines: string[] = [
    "📋 支払い履歴（直近5件）",
    "",
    "━━━━━━━━━━━━━━━",
  ];

  for (const payment of result.payments) {
    const date = payment.stripe_created
      ? new Date(payment.stripe_created * 1000)
      : new Date(payment.created_at);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    const amountStr = `¥${payment.amount.toLocaleString()}`;
    const statusEmoji = getStatusEmoji(payment.status);
    const tierName = payment.tier === "master" ? "Master" : "Library";

    lines.push(`${statusEmoji} ${dateStr} ${amountStr} ${tierName}`);
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━");
  lines.push(`💰 累計お支払い: ¥${result.totalPaid.toLocaleString()}`);

  return lines.join("\n");
}

/**
 * ステータスに応じた絵文字を返す
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case "succeeded":
      return "✅";
    case "failed":
      return "❌";
    case "refunded":
      return "↩️";
    case "pending":
      return "⏳";
    default:
      return "•";
  }
}

/**
 * 支払い履歴照会キーワードのマッチ
 */
export function isPaymentHistoryCommand(text: string): boolean {
  const keywords = [
    "支払い履歴",
    "支払履歴",
    "お支払い履歴",
    "決済履歴",
    "履歴確認",
    "payment history",
    "payments",
  ];
  const normalized = text.toLowerCase().trim();
  return keywords.some((kw) => normalized === kw || normalized.includes(kw));
}
