/**
 * HTTP関連ユーティリティ
 */

/**
 * CORSヘッダーを追加
 */
export function addCorsHeaders(
  headers: Headers,
  origin: string = "*",
): Headers {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return headers;
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
  return match ? match[1] : null;
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
