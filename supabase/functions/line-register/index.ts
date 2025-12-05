// LINE/LIFF用: 無料登録でメール任意取得し members にUPSERT
// - line_user_id: 必須
// - email: 任意（未入力可）
// - opt_in_email: デフォルト true（明示的に false 指定可）
// セキュリティ: x-api-key ヘッダーで簡易保護（LINE_FORM_API_KEY）

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FORM_API_KEY = Deno.env.get("LINE_FORM_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function badRequest(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers,
  });
}

function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (req.method !== "POST") {
    return badRequest("Method not allowed", 405);
  }

  if (!FORM_API_KEY) {
    console.error("[line-register] missing LINE_FORM_API_KEY");
    return badRequest("Server not configured", 500);
  }

  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== FORM_API_KEY) {
    return badRequest("Unauthorized", 401);
  }

  let body: {
    line_user_id?: string;
    email?: string | null;
    opt_in_email?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const lineUserId = body.line_user_id?.trim();
  if (!lineUserId) {
    return badRequest("line_user_id is required");
  }

  const email = normalizeEmail(body.email ?? null);
  const optInEmail =
    typeof body.opt_in_email === "boolean" ? body.opt_in_email : true;

  const payload = {
    line_user_id: lineUserId,
    email,
    tier: "free",
    status: "active",
    opt_in_email: optInEmail,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("members")
    .upsert(payload, { onConflict: "line_user_id" });

  if (error) {
    console.error("[line-register] upsert error", error);
    return badRequest("Database error", 500);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      line_user_id: lineUserId,
      email,
      opt_in_email: optInEmail,
    }),
    { status: 200, headers }
  );
});

