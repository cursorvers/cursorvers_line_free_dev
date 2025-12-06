// LINE/LIFF用: 無料登録でメール任意取得し users または members にUPSERT
// - line_user_id: 任意（LINEログイン時のみ）
// - email: 任意（メール登録時のみ）
// - opt_in_email: デフォルト true（明示的に false 指定可）
// 
// パターン:
// 1. メールのみ → users テーブルに保存
// 2. LINE のみ → members テーブルに保存
// 3. 両方あり → users と members 両方に保存
//
// セキュリティ: LINEのプロフィール取得でline_user_idを検証（LINE_CHANNEL_ACCESS_TOKENが必要）

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";

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
  const email = normalizeEmail(body.email ?? null);
  const optInEmail =
    typeof body.opt_in_email === "boolean" ? body.opt_in_email : true;

  // 少なくとも line_user_id または email のどちらかが必要
  if (!lineUserId && !email) {
    return badRequest("line_user_id or email is required");
  }

  // LINE verification (line_user_id が提供されている場合のみ)
  if (lineUserId) {
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      console.error("[line-register] missing LINE_CHANNEL_ACCESS_TOKEN");
      return badRequest("Server not configured", 500);
    }

    try {
      const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
        headers: {
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      });
      if (!res.ok) {
        console.error("[line-register] LINE profile fetch failed", res.status);
        return badRequest("LINE verification failed", 401);
      }
    } catch (err) {
      console.error("[line-register] LINE profile error", err);
      return badRequest("LINE verification error", 500);
    }
  }

  const timestamp = new Date().toISOString();
  const results: { users?: boolean; members?: boolean } = {};

  // パターン1: メールのみ → members テーブル（無料会員）
  if (email && !lineUserId) {
    const { error } = await supabase
      .from("members")
      .upsert(
        {
          email,
          tier: "free",
          status: "active",
          opt_in_email: optInEmail,
          updated_at: timestamp,
        },
        { onConflict: "email" }
      );

    if (error) {
      console.error("[line-register] members upsert error", error);
      return badRequest("Database error", 500);
    }

    results.members = true;
  }

  // パターン2: LINE のみ → members テーブル
  if (lineUserId && !email) {
    const { error } = await supabase
      .from("members")
      .upsert(
        {
          line_user_id: lineUserId,
          email: null,
          tier: "free",
          status: "active",
          opt_in_email: optInEmail,
          updated_at: timestamp,
        },
        { onConflict: "line_user_id" }
      );

    if (error) {
      console.error("[line-register] members upsert error", error);
      return badRequest("Database error", 500);
    }

    results.members = true;
  }

  // パターン3: 両方あり → members テーブル（emailを優先）
  if (email && lineUserId) {
    const { error } = await supabase
      .from("members")
      .upsert(
        {
          email,
          line_user_id: lineUserId,
          tier: "free",
          status: "active",
          opt_in_email: optInEmail,
          updated_at: timestamp,
        },
        { onConflict: "email" }
      );

    if (error) {
      console.error("[line-register] members upsert error (both)", error);
      return badRequest("Database error", 500);
    }

    results.members = true;
  }

  // ログ記録
  await supabase.from("logs").insert({
    source: "line-register",
    level: "info",
    message: "Registration successful",
    details: {
      line_user_id: lineUserId ? `${lineUserId.slice(0, 8)}***` : null,
      email: email ? `${email.slice(0, 3)}***` : null,
      opt_in_email: optInEmail,
      saved_to: results,
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      line_user_id: lineUserId,
      email,
      opt_in_email: optInEmail,
      saved_to: results,
    }),
    { status: 200, headers }
  );
});
