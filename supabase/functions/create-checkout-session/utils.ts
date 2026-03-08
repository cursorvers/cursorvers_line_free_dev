/**
 * create-checkout-session ユーティリティ関数
 */

import { isValidHttpMethod } from "../_shared/http-utils.ts";
// Note: Email validation is now centralized in _shared/validation-utils.ts
import { EMAIL_REGEX, isValidEmail } from "../_shared/validation-utils.ts";

// Re-export for backwards compatibility
export { EMAIL_REGEX, isValidEmail };

export interface CheckoutRequest {
  email?: string;
  opt_in_email?: boolean;
  agree_terms?: boolean;
  line_user_id?: string;
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

  if (!isValidEmail(email)) {
    return { valid: false, error: "Invalid email format" };
  }

  if (!agreeTerms) {
    return { valid: false, error: "Terms agreement is required" };
  }

  return { valid: true };
}

export type CheckoutRequestParseResult =
  | {
    ok: true;
    body: CheckoutRequest;
  }
  | {
    ok: false;
    error: string;
    status: number;
  };

export async function parseCheckoutRequest(
  request: Request,
): Promise<CheckoutRequestParseResult> {
  if (!isValidHttpMethod(request.method, ["POST"])) {
    return {
      ok: false,
      error: "Method Not Allowed",
      status: 405,
    };
  }

  const rawBody = await request.text();
  if (rawBody.trim().length === 0) {
    return {
      ok: false,
      error: "Request body must be valid JSON",
      status: 400,
    };
  }

  try {
    const parsed = JSON.parse(rawBody) as CheckoutRequest | null;
    const body = (parsed && typeof parsed === "object")
      ? parsed
      : {} as CheckoutRequest;
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      error: "Request body must be valid JSON",
      status: 400,
    };
  }
}

// Note: CORS headers are now managed centrally via ../\_shared/http-utils.ts
// Use createCorsHeaders(req) for dynamic origin validation

// Note: Response helpers moved to use centralized CORS via http-utils.ts
// For response creation, use the corsHeaders from createCorsHeaders(req) in index.ts
