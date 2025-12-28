/**
 * create-checkout-session ユーティリティ関数
 */

// Note: Email validation is now centralized in _shared/validation-utils.ts
import { EMAIL_REGEX, isValidEmail } from "../_shared/validation-utils.ts";

// Re-export for backwards compatibility
export { EMAIL_REGEX, isValidEmail };

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

  if (!isValidEmail(email)) {
    return { valid: false, error: "Invalid email format" };
  }

  if (!agreeTerms) {
    return { valid: false, error: "Terms agreement is required" };
  }

  return { valid: true };
}

// Note: CORS headers are now managed centrally via ../\_shared/http-utils.ts
// Use createCorsHeaders(req) for dynamic origin validation

// Note: Response helpers moved to use centralized CORS via http-utils.ts
// For response creation, use the corsHeaders from createCorsHeaders(req) in index.ts
