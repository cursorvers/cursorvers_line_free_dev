// LINE/LIFF用: 無料登録でメール任意取得し members にUPSERT
// フロー1: メールアドレスのみ保存（line_user_idなし）
// フロー2: LINEログイン後、メールアドレスとline_user_idを紐付け
// - line_user_id: 任意（LIFFのuserId、紐付け時に必要）
// - email: 任意（メールアドレス登録時）
// - opt_in_email: デフォルト true（明示的に false 指定可）
// セキュリティ: line_user_idがある場合はLINEのプロフィール取得で検証（LINE_CHANNEL_ACCESS_TOKENが必要）

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 統一的なログ関数
type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
  const entry = {
    level,
    message,
    ...context,
    timestamp: new Date().toISOString(),
    function: "line-register",
  };
  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// V2 を優先、無ければ従来キー
const LINE_CHANNEL_ACCESS_TOKEN =
  Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN_V2") ??
  Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ??
  "";
// Google Sheets 連携（任意）
const MEMBERS_SHEET_ID = Deno.env.get("MEMBERS_SHEET_ID") ?? "";
const MEMBERS_SHEET_TAB = Deno.env.get("MEMBERS_SHEET_TAB") ?? "members";
const GOOGLE_SA_JSON = Deno.env.get("GOOGLE_SA_JSON") ?? "";

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

async function buildSheetsClient(serviceAccount: any) {
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtPayload = btoa(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://www.googleapis.com/oauth2/v4/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "pkcs8",
    strToUint8Array(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(`${jwtHeader}.${jwtPayload}`),
  );
  const jwtSignature = uint8ToBase64(signature);

  const tokenResponse = await fetch("https://www.googleapis.com/oauth2/v4/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${jwtHeader}.${jwtPayload}.${jwtSignature}`,
    }),
  }).then((res) => res.json());

  if (!tokenResponse.access_token) {
    throw new Error("Failed to obtain Google access token");
  }

  const authHeaders = {
    Authorization: `Bearer ${tokenResponse.access_token}`,
    "Content-Type": "application/json",
  };

  return {
    async append(tabName: string, values: unknown[][]) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${MEMBERS_SHEET_ID}/values/${tabName}!A2:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ values }),
        },
      );
    },
  };
}

async function appendMemberRow(row: unknown[]) {
  if (!MEMBERS_SHEET_ID || !GOOGLE_SA_JSON) {
    return;
  }
  try {
    const client = await buildSheetsClient(JSON.parse(GOOGLE_SA_JSON));
    await client.append(MEMBERS_SHEET_TAB, [row]);
    log("info", "Appended member to sheet", { tab: MEMBERS_SHEET_TAB });
  } catch (err) {
    log("warn", "Failed to append to sheet", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function strToUint8Array(pem: string) {
  const cleaned = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(cleaned);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function uint8ToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

serve(async (req) => {
  log("info", "Request received", { method: req.method });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (req.method !== "POST") {
    log("warn", "Method not allowed", { method: req.method });
    return badRequest("Method not allowed", 405);
  }

  let body: {
    line_user_id?: string;
    email?: string | null;
    opt_in_email?: boolean;
  };

  try {
    body = await req.json();
    log("info", "Request body parsed", {
      hasEmail: !!body.email,
      hasLineUserId: !!body.line_user_id,
      emailPrefix: body.email ? body.email.slice(0, 5) + "***" : null,
    });
  } catch (err) {
    log("error", "Failed to parse JSON", {
      error: err instanceof Error ? err.message : String(err),
    });
    return badRequest("Invalid JSON");
  }

  const lineUserId = body.line_user_id?.trim() || null;
  const email = normalizeEmail(body.email ?? null);
  const optInEmail =
    typeof body.opt_in_email === "boolean" ? body.opt_in_email : true;

  // line_user_idまたはemailのいずれかが必須
  if (!lineUserId && !email) {
    log("warn", "Both line_user_id and email are missing");
    return badRequest("line_user_id or email is required");
  }

  // line_user_idがある場合は検証
  if (lineUserId) {
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      console.error("[line-register] missing LINE_CHANNEL_ACCESS_TOKEN for LINE verification");
      return badRequest("Server not configured for LINE verification", 500);
    }
  // Verify line_user_id by calling LINE profile API
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
    if (!res.ok) {
        log("error", "LINE profile fetch failed", {
          lineUserId: lineUserId?.slice(-4) ?? "null",
          status: res.status,
        });
      return badRequest("LINE verification failed", 401);
    }
      log("info", "LINE profile verified", {
        lineUserId: lineUserId?.slice(-4) ?? "null",
      });
  } catch (err) {
      log("error", "LINE profile verification error", {
        lineUserId: lineUserId?.slice(-4) ?? "null",
        error: err instanceof Error ? err.message : String(err),
      });
    return badRequest("LINE verification error", 500);
  }
  }

  // 既存レコードを確認（emailまたはline_user_idで）
  let existingRecord: {
    id: string;
    email: string | null;
    line_user_id: string | null;
    tier: string | null;
  } | null = null;
  if (email) {
    const { data: emailRecord } = await supabase
      .from("members")
      .select("id,email,line_user_id,tier")
      .eq("email", email)
      .maybeSingle();
    existingRecord = emailRecord as typeof existingRecord;
  }

  if (lineUserId && !existingRecord) {
    const { data: lineRecord } = await supabase
      .from("members")
      .select("id,email,line_user_id,tier")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    existingRecord = lineRecord as typeof existingRecord;
  }

  // 有料会員を無料で上書きしない
  const paidTiers = ["library", "master"];
  const isPaid = existingRecord?.tier
    ? paidTiers.includes(existingRecord.tier)
    : false;

  // 無料用のpayloadを作成（デフォルトでtier=free）
  const payload: Record<string, unknown> = {
    tier: existingRecord?.tier ?? "free",
    status: "active",
    opt_in_email: optInEmail,
    updated_at: new Date().toISOString(),
  };

  if (email) payload.email = email;
  if (lineUserId) payload.line_user_id = lineUserId;

  let error;

  if (existingRecord) {
    if (isPaid) {
      // 有料の場合は原則上書きしないが、line_user_id が未設定なら紐付けのみ許可
      if (lineUserId && !existingRecord.line_user_id) {
        const { error: updatePaid } = await supabase
          .from("members")
          .update({
            line_user_id: lineUserId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingRecord.id);
        if (updatePaid) {
          error = updatePaid;
        }
      }
    } else {
      // 既存が無料の場合のみ更新（tierはfreeを維持）
      payload.tier = "free";

      if (existingRecord.email && existingRecord.email === email) {
        const { error: updateError } = await supabase
          .from("members")
          .update(payload)
          .eq("email", email);
        error = updateError;
      } else if (
        existingRecord.line_user_id &&
        existingRecord.line_user_id === lineUserId
      ) {
        const { error: updateError } = await supabase
          .from("members")
          .update(payload)
          .eq("line_user_id", lineUserId);
        error = updateError;
      } else {
        const { error: updateError } = await supabase
          .from("members")
          .update(payload)
          .eq("id", existingRecord.id);
        error = updateError;
      }
    }
  } else {
    // 新規作成（無料として）
    payload.tier = "free";
    const { error: insertError } = await supabase
    .from("members")
      .insert(payload);
    error = insertError;
  }

  if (error) {
    log("error", "Database upsert error", {
      email: email ? email.slice(0, 5) + "***" : null,
      lineUserId: lineUserId ? lineUserId.slice(-4) : null,
      error: error.message,
      isUpdate: !!existingRecord,
    });
    return badRequest("Database error", 500);
  }

  // ログをデータベースに保存
  try {
    const logPayload: any = {
      log_level: existingRecord ? "info" : "info",
      source: "line-register",
      message: existingRecord ? "Member updated" : "Member created",
      details: {
        hasEmail: !!email,
        hasLineUserId: !!lineUserId,
        optInEmail: optInEmail,
        isUpdate: !!existingRecord,
        emailPrefix: email ? email.slice(0, 5) + "***" : null,
        lineUserIdSuffix: lineUserId ? lineUserId.slice(-4) : null,
      },
    };

    const { error: logError } = await supabase.from("logs").insert(logPayload);
    if (logError) {
      log("warn", "Failed to save log to database", {
        error: logError.message,
      });
    } else {
      log("info", "Log saved to database", {
        logId: "saved",
      });
    }
  } catch (logErr) {
    log("warn", "Error saving log", {
      error: logErr instanceof Error ? logErr.message : String(logErr),
    });
  }

  // Google Sheets へ追記（設定されている場合のみ）
  await appendMemberRow([
    email ?? "",
    (payload.tier as string) ?? "",
    (payload.status as string) ?? "",
    "", // period_end（未管理）
    optInEmail,
    (payload.updated_at as string) ?? new Date().toISOString(),
    lineUserId ?? "",
    "", // stripe_customer_id（未設定）
    "", // stripe_subscription_id（未設定）
    "", // subscription_status（未設定）
  ]);

  log("info", "Registration completed", {
    email: email ? email.slice(0, 5) + "***" : null,
    lineUserId: lineUserId ? lineUserId.slice(-4) : null,
    optInEmail: optInEmail,
    isUpdate: !!existingRecord,
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
