/**
 * LINE/LIFF用: 無料登録でメール任意取得し members にUPSERT
 * フロー1: メールアドレスのみ保存（line_user_idなし）
 * フロー2: LINEログイン後、メールアドレスとline_user_idを紐付け
 * - line_user_id: 任意（LIFFのuserId、紐付け時に必要）
 * - email: 任意（メールアドレス登録時）
 * - opt_in_email: デフォルト true（明示的に false 指定可）
 * セキュリティ: line_user_idがある場合はLINEのプロフィール取得で検証
 */
import { createClient } from "@supabase/supabase-js";
import { createSheetsClientFromEnv } from "../_shared/google-sheets.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("line-register");

// 日本時間（JST, UTC+9）を返すヘルパー関数
function getJSTTimestamp(): string {
  const now = new Date();
  const jstOffset = 9 * 60; // JST is UTC+9
  const jstTime = new Date(now.getTime() + jstOffset * 60 * 1000);
  return jstTime.toISOString().replace("Z", "+09:00");
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
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

async function appendMemberRow(row: unknown[]) {
  if (!MEMBERS_SHEET_ID || !GOOGLE_SA_JSON) {
    return;
  }
  try {
    const client = await createSheetsClientFromEnv(
      GOOGLE_SA_JSON,
      MEMBERS_SHEET_ID,
    );
    await client.append(MEMBERS_SHEET_TAB, [row]);
    log.info("Appended member to sheet", { tab: MEMBERS_SHEET_TAB });
  } catch (err) {
    log.warn("Failed to append to sheet", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

Deno.serve(async (req) => {
  try {
    // 環境変数チェック
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      log.error("Missing required environment variables", {
        hasSupabaseUrl: !!SUPABASE_URL,
        hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
      });
      return badRequest("Server configuration error", 500);
    }

    log.info("Request received", { method: req.method });

    if (req.method === "OPTIONS") {
      return new Response("ok", { headers });
    }

    if (req.method !== "POST") {
      log.warn("Method not allowed", { method: req.method });
      return badRequest("Method not allowed", 405);
    }

    let body: {
      line_user_id?: string;
      email?: string | null;
      opt_in_email?: boolean;
    };

    try {
      body = await req.json();
      log.info("Request body parsed", {
        hasEmail: !!body.email,
        hasLineUserId: !!body.line_user_id,
        emailPrefix: body.email ? body.email.slice(0, 5) + "***" : null,
      });
    } catch (err) {
      log.error("Failed to parse JSON", {
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return badRequest("Invalid JSON");
    }

    const lineUserId = body.line_user_id?.trim() || null;
    const email = normalizeEmail(body.email ?? null);
    const optInEmail = typeof body.opt_in_email === "boolean"
      ? body.opt_in_email
      : true;

    // line_user_idまたはemailのいずれかが必須
    if (!lineUserId && !email) {
      log.warn("Both line_user_id and email are missing");
      return badRequest("line_user_id or email is required");
    }

    // line_user_idがある場合は検証（オプション）
    if (lineUserId && LINE_CHANNEL_ACCESS_TOKEN) {
      // Verify line_user_id by calling LINE profile API (optional)
      try {
        const res = await fetch(
          `https://api.line.me/v2/bot/profile/${lineUserId}`,
          {
            headers: {
              Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
            },
          },
        );
        if (!res.ok) {
          log.warn("LINE profile fetch failed (user may not be a friend)", {
            lineUserId: lineUserId?.slice(-4) ?? "null",
            status: res.status,
          });
          // 401または404エラーの場合は友だちでない可能性があるため、検証をスキップ
          if (res.status !== 401 && res.status !== 404) {
            return badRequest("LINE verification failed", res.status);
          }
        } else {
          log.info("LINE profile verified", {
            lineUserId: lineUserId?.slice(-4) ?? "null",
          });
        }
      } catch (err) {
        log.error("LINE profile verification error", {
          lineUserId: lineUserId?.slice(-4) ?? "null",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        // エラーが発生しても処理を継続
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
      updated_at: getJSTTimestamp(),
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
              updated_at: getJSTTimestamp(),
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
      log.error("Database upsert error", {
        email: email ? email.slice(0, 5) + "***" : null,
        lineUserId: lineUserId ? lineUserId.slice(-4) : null,
        errorMessage: error.message,
        isUpdate: !!existingRecord,
      });
      return badRequest("Database error", 500);
    }

    // ログをデータベースに保存
    try {
      const logPayload: {
        log_level: string;
        source: string;
        message: string;
        details: Record<string, unknown>;
      } = {
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

      const { error: logError } = await supabase.from("logs").insert(
        logPayload,
      );
      if (logError) {
        log.warn("Failed to save log to database", {
          errorMessage: logError.message,
        });
      } else {
        log.debug("Log saved to database");
      }
    } catch (logErr) {
      log.warn("Error saving log", {
        errorMessage: logErr instanceof Error ? logErr.message : String(logErr),
      });
    }

    // Google Sheets へ追記（設定されている場合のみ）
    await appendMemberRow([
      email ?? "",
      (payload.tier as string) ?? "",
      (payload.status as string) ?? "",
      "", // period_end（未管理）
      optInEmail,
      (payload.updated_at as string) ?? getJSTTimestamp(),
      lineUserId ?? "",
      "", // stripe_customer_id（未設定）
      "", // stripe_subscription_id（未設定）
      "", // subscription_status（未設定）
    ]);

    log.info("Registration completed", {
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
      }),
      { status: 200, headers },
    );
  } catch (err) {
    log.error("Unhandled error in serve", {
      errorMessage: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers },
    );
  }
});
