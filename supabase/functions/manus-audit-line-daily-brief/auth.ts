/**
 * 認証モジュール
 */
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("audit-auth");

interface AuthConfig {
  apiKey?: string | undefined;
  serviceRoleKey: string;
}

export function verifyAuth(req: Request, config: AuthConfig): boolean {
  const { apiKey, serviceRoleKey } = config;

  // Method 1: X-API-Key header
  const apiKeyHeader = req.headers.get("X-API-Key");
  if (apiKey && apiKeyHeader === apiKey) {
    log.info("Authentication successful via X-API-Key");
    return true;
  }

  // Method 2: Authorization Bearer (service role key) - fallback
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token === serviceRoleKey) {
      log.info("Authentication successful via Bearer token");
      return true;
    }
  }

  log.warn("Authentication failed", {
    hasApiKey: !!apiKey,
    hasApiKeyHeader: !!apiKeyHeader,
  });
  return false;
}
