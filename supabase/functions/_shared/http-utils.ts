/**
 * HTTP関連ユーティリティ
 */

/**
 * 許可されたオリジンのリストを取得（環境変数から）
 * CORS_ALLOWED_ORIGINS: カンマ区切りで複数指定可能
 * 例: "https://cursorvers.com,https://app.cursorvers.com"
 */
function getAllowedOrigins(): string[] {
  const origins = Deno.env.get("CORS_ALLOWED_ORIGINS");
  if (!origins) {
    // デフォルトの許可オリジン（本番環境用）
    return [
      "https://cursorvers.com",
      "https://www.cursorvers.com",
      "https://app.cursorvers.com",
      "https://liff.line.me",
    ];
  }
  return origins.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
}

/**
 * リクエストのOriginが許可されているかチェックし、適切なOriginを返す
 * @param requestOrigin リクエストヘッダーのOrigin
 * @returns 許可されたOrigin、または許可されていない場合は最初の許可オリジン
 */
export function getCorsOrigin(requestOrigin: string | null): string {
  const allowedOrigins = getAllowedOrigins();

  // 開発環境では全て許可
  if (Deno.env.get("DENO_ENV") === "development") {
    return requestOrigin || allowedOrigins[0] || "https://cursorvers.com";
  }

  // リクエストのOriginが許可リストに含まれているか確認
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // 許可されていない場合は最初の許可オリジンを返す（CORSエラーになる）
  return allowedOrigins[0] || "https://cursorvers.com";
}

/**
 * CORSヘッダーを追加（リクエストのOriginを検証）
 */
export function addCorsHeaders(
  headers: Headers,
  requestOrigin?: string | null,
): Headers {
  const origin = getCorsOrigin(requestOrigin ?? null);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, x-client-info, apikey",
  );
  headers.set("Access-Control-Allow-Credentials", "true");
  return headers;
}

/**
 * CORSプリフライトレスポンスを作成
 */
export function createCorsPreflightResponse(request: Request): Response {
  const requestOrigin = request.headers.get("Origin");
  const headers = new Headers();
  addCorsHeaders(headers, requestOrigin);
  return new Response(null, { status: 204, headers });
}

/**
 * CORSヘッダー付きのヘッダーオブジェクトを作成
 */
export function createCorsHeaders(request: Request): Record<string, string> {
  const requestOrigin = request.headers.get("Origin");
  const origin = getCorsOrigin(requestOrigin);
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, x-client-info, apikey",
    "Access-Control-Allow-Credentials": "true",
  };
}

/**
 * JSONレスポンスを作成
 */
export function jsonResponse(
  data: unknown,
  status: number = 200,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

/**
 * エラーレスポンスを作成
 */
export function errorResponse(
  message: string,
  status: number = 500,
): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * リクエストからBearerトークンを抽出
 */
export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * クエリパラメータをオブジェクトに変換
 */
export function parseQueryParams(url: URL): Record<string, string> {
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/**
 * HTTPメソッドが有効かどうかをチェック
 */
export function isValidHttpMethod(
  method: string,
  allowed: string[],
): boolean {
  return allowed.includes(method.toUpperCase());
}

/**
 * Content-Typeがapplication/jsonかどうかをチェック
 */
export function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("Content-Type");
  if (!contentType) return false;
  return contentType.toLowerCase().includes("application/json");
}

/**
 * リクエストボディをJSONとしてパース
 */
export async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    const body = await request.json();
    return body as T;
  } catch {
    return null;
  }
}

/**
 * リトライ可能なHTTPステータスかどうかをチェック
 */
export function isRetryableStatus(status: number): boolean {
  // 429 (Too Many Requests), 500, 502, 503, 504
  return status === 429 || (status >= 500 && status <= 504);
}

/**
 * ステータスコードが成功かどうかをチェック
 */
export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}
