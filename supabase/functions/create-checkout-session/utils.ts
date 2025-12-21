/**
 * create-checkout-session ユーティリティ関数
 */

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * メールアドレスのバリデーション
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

/**
 * Checkoutリクエストのバリデーション結果
 */
export interface CheckoutValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Checkoutリクエストのバリデーション
 */
export function validateCheckoutRequest(
  email: string | undefined,
  agreeTerms: boolean | undefined,
): CheckoutValidationResult {
  if (!email) {
    return { valid: false, error: "Email is required" };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, error: "Invalid email format" };
  }

  if (!agreeTerms) {
    return { valid: false, error: "Terms agreement is required" };
  }

  return { valid: true };
}

/**
 * CORS headers
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * エラーレスポンスの作成
 */
export function createErrorResponse(
  message: string,
  status: number = 400,
): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

/**
 * 成功レスポンスの作成
 */
export function createSuccessResponse(
  data: unknown,
  status: number = 200,
): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
