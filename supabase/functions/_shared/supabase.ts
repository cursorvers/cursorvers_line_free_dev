/**
 * 共有 Supabase クライアント
 * 全 Edge Functions で単一インスタンスを使用
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?target=deno";
import { createLogger } from "./logger.ts";

const log = createLogger("supabase");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  log.warn("Environment variables not fully configured");
}

/**
 * Service Role 権限を持つ Supabase クライアント
 * セッション永続化は無効（Edge Functions向け）
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  }
);

// 環境変数を再エクスポート（必要な場合のみ）
export { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY };
